import {
  buildAuthorAttestation,
  CREATION_DISCLOSURE_SCHEMA,
  CURRENT_ATTESTATION_STATEMENT_VERSION,
  generateProofId,
  generateWorkId,
  hashCanonicalJson,
  hashLegalName,
  normalizeTypedName,
  TEXT_CANONICALIZATION,
  toHex,
  type WorkType,
} from "@authoro/core";
import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import {
  attestations,
  authorAttestations,
  proofRecords,
  recordEvents,
  works,
  workVersions,
} from "@/db/schema";
import { envelopeEvidence } from "./evidence";
import type { AuthorProfile } from "./profiles";
import type { ValidRegistration } from "./registration-validation";

export type RegistrationErrorCode =
  "not-found" | "not-pending" | "invalid-name" | "draft-exists" | "unchanged" | "not-registered";

export class RegistrationError extends Error {
  constructor(
    readonly code: RegistrationErrorCode,
    message: string,
    /** The record behind a conflict: the pending draft, or the identical version. */
    readonly proofId?: string,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

const PUBLIC_ID_CONSTRAINTS = new Set(["proof_records_publicId_unique", "works_publicId_unique"]);

function isPublicIdCollision(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } })?.cause;
  return cause?.code === "23505" && PUBLIC_ID_CONSTRAINTS.has(cause.constraint_name ?? "");
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Inserts a pending version with its proof record and author-supplied evidence. */
async function insertPendingVersion(
  tx: Transaction,
  {
    workId,
    versionNumber,
    userId,
    profile,
    registration,
  }: {
    workId: string;
    versionNumber: number;
    userId: string;
    profile: AuthorProfile;
    registration: ValidRegistration;
  },
): Promise<string> {
  const { work, document, disclosure, envelopes } = registration;
  const disclosurePayload = { schema: CREATION_DISCLOSURE_SCHEMA, ...disclosure };
  const [version] = await tx
    .insert(workVersions)
    .values({
      workId,
      versionNumber,
      title: work.title,
      description: work.description,
      canonicalUrl: work.canonicalUrl,
      authorDisplayName: profile.displayName,
      contentHash: document.contentHash,
      textHash: document.textHash,
      textCanonicalization: document.textHash ? TEXT_CANONICALIZATION : null,
      mediaType: document.mediaType,
      byteLength: document.byteLength,
      wordCount: document.wordCount,
    })
    .returning();
  const [record] = await tx
    .insert(proofRecords)
    .values({ publicId: generateProofId(), workVersionId: version!.id })
    .returning();

  await tx.insert(attestations).values({
    workVersionId: version!.id,
    evidenceClass: "self",
    claimType: "creation-disclosure",
    submittedByUserId: userId,
    payload: disclosurePayload,
    payloadHash: await hashCanonicalJson(disclosurePayload),
  });
  for (const envelope of envelopes) {
    await tx.insert(attestations).values({
      workVersionId: version!.id,
      submittedByUserId: userId,
      ...(await envelopeEvidence(envelope)),
    });
  }
  return record!.publicId;
}

/** Retries a transaction when a freshly generated public ID collides. */
async function withFreshIds<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (isPublicIdCollision(error) && attempt < 5) continue;
      throw error;
    }
  }
}

/**
 * Creates the work, version 1, a proof record awaiting the author's
 * attestation, and the author-supplied evidence. Nothing is public until
 * `finalizeRegistration` runs.
 */
export async function prepareRegistration(
  db: Database,
  {
    userId,
    profile,
    registration,
  }: { userId: string; profile: AuthorProfile; registration: ValidRegistration },
): Promise<{ proofId: string; workId: string }> {
  const { work } = registration;
  return withFreshIds(() =>
    db.transaction(async (tx) => {
      const [createdWork] = await tx
        .insert(works)
        .values({
          publicId: generateWorkId(),
          ownerId: userId,
          authorProfileId: profile.id,
          title: work.title,
          workType: work.workType,
          canonicalUrl: work.canonicalUrl,
          description: work.description,
        })
        .returning();
      const proofId = await insertPendingVersion(tx, {
        workId: createdWork!.id,
        versionNumber: 1,
        userId,
        profile,
        registration,
      });
      return { proofId, workId: createdWork!.publicId };
    }),
  );
}

/**
 * Prepares the next version of an existing work. A work has at most one
 * pending version at a time, and a version identical to an earlier one is
 * refused. The work type is fixed by the work.
 */
export async function prepareVersion(
  db: Database,
  {
    userId,
    profile,
    workPublicId,
    registration,
  }: { userId: string; profile: AuthorProfile; workPublicId: string; registration: ValidRegistration },
): Promise<{ proofId: string; workId: string; versionNumber: number }> {
  return withFreshIds(() =>
    db.transaction(async (tx) => {
      const [work] = await tx
        .select()
        .from(works)
        .where(and(eq(works.publicId, workPublicId), eq(works.ownerId, userId)))
        .for("update")
        .limit(1);
      if (!work) throw new RegistrationError("not-found", "Work not found.");

      const existing = await tx
        .select({
          versionNumber: workVersions.versionNumber,
          contentHash: workVersions.contentHash,
          proofId: proofRecords.publicId,
          status: proofRecords.status,
        })
        .from(workVersions)
        .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
        .where(eq(workVersions.workId, work.id))
        .orderBy(desc(workVersions.versionNumber));

      const draft = existing.find((version) => version.status === "pending_attestation");
      if (draft) {
        throw new RegistrationError(
          "draft-exists",
          `Version ${draft.versionNumber} (${draft.proofId}) is waiting for attestation. Finish or discard it first.`,
          draft.proofId,
        );
      }
      const identical = existing.find((version) => version.contentHash === registration.document.contentHash);
      if (identical) {
        throw new RegistrationError(
          "unchanged",
          `This document is identical to version ${identical.versionNumber} (${identical.proofId}).`,
          identical.proofId,
        );
      }

      const versionNumber = (existing[0]?.versionNumber ?? 0) + 1;
      const proofId = await insertPendingVersion(tx, {
        workId: work.id,
        versionNumber,
        userId,
        profile,
        // The type belongs to the work, not the version.
        registration: {
          ...registration,
          work: { ...registration.work, workType: work.workType as WorkType },
        },
      });
      return { proofId, workId: work.publicId, versionNumber };
    }),
  );
}

/**
 * An owned work with its versions (newest first), for preparing the next one:
 * the latest attested version to start from and any draft that blocks it.
 * Null when the work doesn't exist or belongs to someone else.
 */
export async function getWorkForNewVersion(db: Database, workPublicId: string, userId: string) {
  const [work] = await db
    .select({ id: works.id, publicId: works.publicId, workType: works.workType, title: works.title })
    .from(works)
    .where(and(eq(works.publicId, workPublicId), eq(works.ownerId, userId)))
    .limit(1);
  if (!work) return null;

  const versions = await db
    .select({
      versionNumber: workVersions.versionNumber,
      title: workVersions.title,
      canonicalUrl: workVersions.canonicalUrl,
      description: workVersions.description,
      contentHash: workVersions.contentHash,
      textHash: workVersions.textHash,
      proofId: proofRecords.publicId,
      status: proofRecords.status,
    })
    .from(workVersions)
    .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
    .where(eq(workVersions.workId, work.id))
    .orderBy(desc(workVersions.versionNumber));

  return {
    work: { publicId: work.publicId, workType: work.workType as WorkType, title: work.title },
    versions,
    latest: versions.find((version) => version.status !== "pending_attestation") ?? null,
    draft: versions.find((version) => version.status === "pending_attestation") ?? null,
    nextVersionNumber: (versions[0]?.versionNumber ?? 0) + 1,
  };
}

export type WorkForNewVersion = NonNullable<Awaited<ReturnType<typeof getWorkForNewVersion>>>;

/** A registration owned by `userId`, with everything the attestation page shows. */
export async function getOwnedRegistration(db: Database, proofId: string, userId: string) {
  const [row] = await db
    .select({ record: proofRecords, version: workVersions, work: works })
    .from(proofRecords)
    .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
    .limit(1);
  if (!row) return null;
  const [evidence, [previous]] = await Promise.all([
    db
      .select()
      .from(attestations)
      .where(eq(attestations.workVersionId, row.version.id))
      .orderBy(attestations.createdAt),
    // The earlier record that registering this version will annotate.
    db
      .select({ versionNumber: workVersions.versionNumber, proofId: proofRecords.publicId })
      .from(workVersions)
      .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
      .where(
        and(
          eq(workVersions.workId, row.work.id),
          lt(workVersions.versionNumber, row.version.versionNumber),
          ne(proofRecords.status, "pending_attestation"),
        ),
      )
      .orderBy(desc(workVersions.versionNumber))
      .limit(1),
  ]);
  return { ...row, evidence, previous: previous ?? null };
}

export type OwnedRegistration = NonNullable<Awaited<ReturnType<typeof getOwnedRegistration>>>;

/**
 * The human step: records the author's attestation and registers the proof
 * record. Only the authenticated owner can do this; agents and integrations
 * can prepare a registration but never finalize it.
 */
export async function finalizeRegistration(
  db: Database,
  {
    proofId,
    userId,
    typedName,
    now = new Date(),
  }: { proofId: string; userId: string; typedName: string; now?: Date },
): Promise<{ proofId: string; attestationHash: string }> {
  const name = normalizeTypedName(typedName);
  if (name.length < 2 || name.length > 200) {
    throw new RegistrationError("invalid-name", "Type your full name to attest.");
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ record: proofRecords, version: workVersions, authorProfileId: works.authorProfileId })
      .from(proofRecords)
      .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
      .innerJoin(works, eq(works.id, workVersions.workId))
      .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
      .for("update", { of: proofRecords })
      .limit(1);
    if (!row) throw new RegistrationError("not-found", "Registration not found.");
    if (row.record.status !== "pending_attestation") {
      throw new RegistrationError("not-pending", "This record has already been registered.");
    }

    const [disclosure] = await tx
      .select({ payloadHash: attestations.payloadHash })
      .from(attestations)
      .where(
        and(
          eq(attestations.workVersionId, row.version.id),
          eq(attestations.claimType, "creation-disclosure"),
        ),
      )
      .limit(1);

    const salt = randomSalt();
    const { attestation, attestationHash } = await buildAuthorAttestation({
      proofId,
      contentHash: row.version.contentHash,
      textHash: row.version.textHash,
      author: row.authorProfileId,
      disclosureHash: disclosure?.payloadHash ?? null,
      legalNameHash: await hashLegalName(name, salt),
      signedAt: now,
      statementVersion: CURRENT_ATTESTATION_STATEMENT_VERSION,
    });

    await tx.insert(authorAttestations).values({
      workVersionId: row.version.id,
      userId,
      statementVersion: attestation.statementVersion,
      legalNameHash: attestation.legalNameHash,
      legalNameSalt: salt,
      payload: attestation,
      attestationHash,
      signedAt: now,
    });
    await tx
      .update(proofRecords)
      .set({ status: "registered", registeredAt: now })
      .where(eq(proofRecords.id, row.record.id));
    await tx.insert(recordEvents).values({
      proofRecordId: row.record.id,
      eventType: "registered",
      actorUserId: userId,
      data: { attestationHash, statementVersion: attestation.statementVersion },
      createdAt: now,
    });

    // The work's current metadata follows its newest registered version.
    await tx
      .update(works)
      .set({
        title: row.version.title,
        canonicalUrl: row.version.canonicalUrl,
        description: row.version.description,
      })
      .where(eq(works.id, row.version.workId));

    // Earlier records stay valid; their history notes that a newer version exists.
    if (row.version.versionNumber > 1) {
      const [previous] = await tx
        .select({ id: proofRecords.id })
        .from(workVersions)
        .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
        .where(
          and(
            eq(workVersions.workId, row.version.workId),
            lt(workVersions.versionNumber, row.version.versionNumber),
            ne(proofRecords.status, "pending_attestation"),
          ),
        )
        .orderBy(desc(workVersions.versionNumber))
        .limit(1);
      if (previous) {
        await tx.insert(recordEvents).values({
          proofRecordId: previous.id,
          eventType: "newer-version-registered",
          actorUserId: userId,
          data: { proofId, versionNumber: row.version.versionNumber },
          createdAt: now,
        });
      }
    }
    return { proofId, attestationHash };
  });
}

/** Deletes a registration that was never attested. Registered records can't be deleted. */
export async function discardPendingRegistration(
  db: Database,
  { proofId, userId }: { proofId: string; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ record: proofRecords, version: workVersions })
      .from(proofRecords)
      .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
      .innerJoin(works, eq(works.id, workVersions.workId))
      .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
      .for("update", { of: proofRecords })
      .limit(1);
    if (!row) throw new RegistrationError("not-found", "Registration not found.");
    if (row.record.status !== "pending_attestation") {
      throw new RegistrationError("not-pending", "Registered records can't be discarded.");
    }
    await tx.delete(attestations).where(eq(attestations.workVersionId, row.version.id));
    await tx.delete(proofRecords).where(eq(proofRecords.id, row.record.id));
    await tx.delete(workVersions).where(eq(workVersions.id, row.version.id));
    const [remaining] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(workVersions)
      .where(eq(workVersions.workId, row.version.workId));
    if (!remaining?.count) await tx.delete(works).where(eq(works.id, row.version.workId));
  });
}

/** The author's works, newest first, with each version's proof status. */
export async function listWorksForUser(db: Database, userId: string) {
  const rows = await db
    .select({
      recordId: proofRecords.id,
      workId: works.publicId,
      workType: works.workType,
      createdAt: works.createdAt,
      title: workVersions.title,
      versionNumber: workVersions.versionNumber,
      proofId: proofRecords.publicId,
      status: proofRecords.status,
      registeredAt: proofRecords.registeredAt,
    })
    .from(works)
    .innerJoin(workVersions, eq(workVersions.workId, works.id))
    .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
    .where(eq(works.ownerId, userId))
    .orderBy(desc(works.createdAt), desc(workVersions.versionNumber));
  return rows;
}

/** Publicly registered records whose fingerprints match, for duplicate warnings and lookups. */
export async function findRegisteredByFingerprint(
  db: Database,
  { contentHash, textHash }: { contentHash?: string | null; textHash?: string | null },
) {
  const hashConditions = [];
  if (contentHash) hashConditions.push(eq(workVersions.contentHash, contentHash));
  if (textHash) hashConditions.push(eq(workVersions.textHash, textHash));
  if (!hashConditions.length) return [];
  return db
    .select({
      proofId: proofRecords.publicId,
      title: workVersions.title,
      authorDisplayName: workVersions.authorDisplayName,
      registeredAt: proofRecords.registeredAt,
      ownerId: works.ownerId,
      contentHash: workVersions.contentHash,
      textHash: workVersions.textHash,
    })
    .from(workVersions)
    .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .where(
      and(
        or(...hashConditions),
        inArray(proofRecords.status, ["registered"]),
        eq(proofRecords.visibility, "public"),
      ),
    )
    .orderBy(proofRecords.registeredAt)
    .limit(5);
}

export const WITHDRAWAL_REASONS = {
  "incorrect-metadata": "The record's details are wrong",
  "erroneous-submission": "Registered by mistake",
  "author-request": "The author no longer wants this record",
  other: "Other",
} as const;

export type WithdrawalReason = keyof typeof WITHDRAWAL_REASONS;

export function isWithdrawalReason(value: unknown): value is WithdrawalReason {
  return typeof value === "string" && Object.hasOwn(WITHDRAWAL_REASONS, value);
}

/**
 * Withdraws a registered record. Withdrawal is final and public: the record
 * stays resolvable with a banner, its history gains a `withdrawn` event, and
 * nothing is deleted.
 */
export async function withdrawRecord(
  db: Database,
  {
    proofId,
    userId,
    reason,
    note,
    now = new Date(),
  }: { proofId: string; userId: string; reason: WithdrawalReason; note?: string | null; now?: Date },
): Promise<void> {
  const cleanNote = note?.trim().slice(0, 500) || null;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ record: proofRecords })
      .from(proofRecords)
      .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
      .innerJoin(works, eq(works.id, workVersions.workId))
      .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
      .for("update", { of: proofRecords })
      .limit(1);
    if (!row) throw new RegistrationError("not-found", "Record not found.");
    if (row.record.status !== "registered") {
      throw new RegistrationError(
        "not-registered",
        row.record.status === "withdrawn"
          ? "This record is already withdrawn."
          : "Only registered records can be withdrawn.",
      );
    }
    await tx
      .update(proofRecords)
      .set({
        status: "withdrawn",
        withdrawnAt: now,
        withdrawnReason: cleanNote
          ? `${WITHDRAWAL_REASONS[reason]}: ${cleanNote}`
          : WITHDRAWAL_REASONS[reason],
      })
      .where(eq(proofRecords.id, row.record.id));
    await tx.insert(recordEvents).values({
      proofRecordId: row.record.id,
      eventType: "withdrawn",
      actorUserId: userId,
      data: { reason, note: cleanNote },
      createdAt: now,
    });
  });
}
