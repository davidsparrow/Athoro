import {
  buildAuthorAttestation,
  CURRENT_ATTESTATION_STATEMENT_VERSION,
  generateProofId,
  generateWorkId,
  hashCanonicalJson,
  hashLegalName,
  normalizeTypedName,
  TEXT_CANONICALIZATION,
  toHex,
} from "@authoro/core";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  attestations,
  authorAttestations,
  proofRecords,
  recordEvents,
  works,
  workVersions,
} from "@/db/schema";
import type { AuthorProfile } from "./profiles";
import type { ValidRegistration } from "./registration-validation";

export const CREATION_DISCLOSURE_SCHEMA = "authoro-creation-disclosure/1.0";

export type RegistrationErrorCode = "not-found" | "not-pending" | "invalid-name";

export class RegistrationError extends Error {
  constructor(
    readonly code: RegistrationErrorCode,
    message: string,
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
  const { work, document, disclosure, envelope } = registration;
  const disclosurePayload = { schema: CREATION_DISCLOSURE_SCHEMA, ...disclosure };
  const disclosureHash = await hashCanonicalJson(disclosurePayload);
  const envelopeHash = envelope ? await hashCanonicalJson(envelope) : null;

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
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
        const [version] = await tx
          .insert(workVersions)
          .values({
            workId: createdWork!.id,
            versionNumber: 1,
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
          payloadHash: disclosureHash,
        });
        if (envelope && envelopeHash) {
          await tx.insert(attestations).values({
            workVersionId: version!.id,
            evidenceClass: envelope.evidence.class ?? "self",
            claimType: "proof-envelope",
            submittedByUserId: userId,
            payload: envelope,
            payloadHash: envelopeHash,
            signature: envelope.signature ?? null,
            // Issuer keys arrive in V1; until then a signature can't be checked.
            signatureStatus: envelope.signature ? "unverifiable" : "unsigned",
          });
        }
        return { proofId: record!.publicId, workId: createdWork!.publicId };
      });
    } catch (error) {
      if (isPublicIdCollision(error) && attempt < 5) continue;
      throw error;
    }
  }
}

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
  const evidence = await db
    .select()
    .from(attestations)
    .where(eq(attestations.workVersionId, row.version.id))
    .orderBy(attestations.createdAt);
  return { ...row, evidence };
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
      .select({ record: proofRecords, version: workVersions })
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
      account: userId,
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

/** Publicly registered records whose fingerprints match, for duplicate warnings. */
export async function findRegisteredByFingerprint(
  db: Database,
  { contentHash, textHash }: { contentHash: string; textHash: string | null },
) {
  const hashConditions = [eq(workVersions.contentHash, contentHash)];
  if (textHash) hashConditions.push(eq(workVersions.textHash, textHash));
  return db
    .select({
      proofId: proofRecords.publicId,
      title: workVersions.title,
      authorDisplayName: workVersions.authorDisplayName,
      registeredAt: proofRecords.registeredAt,
      ownerId: works.ownerId,
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
