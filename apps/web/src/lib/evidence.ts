import { DOCUMENTATION_SCHEMA, hashCanonicalJson, type ProofEnvelope } from "@authoro/core";
import { and, asc, eq } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { attestations, proofRecords, recordEvents, works, workVersions } from "@/db/schema";
import { envelopeMatches, type EvidenceSubmission } from "./evidence-validation";

/**
 * Evidence on registered versions is append-only (decision 022). The author
 * can add documentation links or Proof Envelopes later, each with its own
 * date; the original attestation is unchanged. Evidence submitted through an
 * API key waits for the author's approval before it is public, and the author
 * can revoke what was added later, never what they attested to.
 */

/** Statuses readers see. Evidence awaiting approval, or declined, is never public. */
export const PUBLIC_EVIDENCE_STATUSES = ["active", "revoked", "disputed"] as const;

/** Submissions an integration can leave waiting for approval on one version. */
export const MAX_PENDING_EVIDENCE = 10;
/** Evidence that can be added to one version after registration, declined submissions aside. */
export const MAX_ADDED_EVIDENCE = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EvidenceErrorCode =
  | "not-found"
  | "not-registered"
  | "mismatch"
  | "duplicate"
  | "pending-limit"
  | "evidence-limit"
  | "not-pending"
  | "not-revocable";

export class EvidenceError extends Error {
  constructor(
    readonly code: EvidenceErrorCode,
    message: string,
    /** The evidence behind a conflict, such as an identical earlier submission. */
    readonly evidenceId?: string,
  ) {
    super(message);
    this.name = "EvidenceError";
  }
}

/** Column values for storing a Proof Envelope as evidence. */
export async function envelopeEvidence(envelope: ProofEnvelope) {
  return {
    evidenceClass: envelope.evidence.class ?? "self",
    claimType: "proof-envelope",
    payload: envelope,
    payloadHash: await hashCanonicalJson(envelope),
    signature: envelope.signature ?? null,
    // Issuer keys arrive in V1; until then a signature can't be checked.
    signatureStatus: envelope.signature ? ("unverifiable" as const) : ("unsigned" as const),
  };
}

async function submissionEvidence(submission: EvidenceSubmission) {
  if (submission.kind === "envelope") return envelopeEvidence(submission.envelope);
  const payload = { schema: DOCUMENTATION_SCHEMA, links: submission.links };
  return {
    evidenceClass: "self" as const,
    claimType: "documentation",
    payload,
    payloadHash: await hashCanonicalJson(payload),
  };
}

/** One of the user's records, locked so additions to it are counted one at a time. */
async function lockOwnedRecord(tx: Transaction, proofId: string, userId: string) {
  const [row] = await tx
    .select({ record: proofRecords, version: workVersions })
    .from(proofRecords)
    .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
    .for("update", { of: proofRecords })
    .limit(1);
  if (!row) throw new EvidenceError("not-found", "Record not found.");
  return row;
}

async function findEvidence(tx: Transaction, versionId: string, evidenceId: string) {
  if (!UUID.test(evidenceId)) return null;
  const [item] = await tx
    .select()
    .from(attestations)
    .where(and(eq(attestations.id, evidenceId), eq(attestations.workVersionId, versionId)))
    .limit(1);
  return item ?? null;
}

/**
 * Adds evidence to a registered version. The author's additions are public at
 * once; an API key's wait for the author's approval. Either way the addition
 * is dated, attributed and never edited.
 */
export async function addEvidence(
  db: Database,
  {
    proofId,
    userId,
    via,
    submission,
    now = new Date(),
  }: {
    proofId: string;
    userId: string;
    via: "author" | "api";
    submission: EvidenceSubmission;
    now?: Date;
  },
) {
  return db.transaction(async (tx) => {
    const { record, version } = await lockOwnedRecord(tx, proofId, userId);
    if (record.status !== "registered") {
      throw new EvidenceError(
        "not-registered",
        record.status === "withdrawn"
          ? "This record is withdrawn, so nothing more can be added to it."
          : "Evidence can be added once the record is registered. Finish the attestation first.",
      );
    }
    if (submission.kind === "envelope" && !envelopeMatches(submission.envelope, version)) {
      throw new EvidenceError(
        "mismatch",
        "The envelope describes a different document (its work.hash doesn't match this version).",
      );
    }

    const values = await submissionEvidence(submission);
    const existing = await tx
      .select({
        id: attestations.id,
        status: attestations.status,
        addedVia: attestations.addedVia,
        payloadHash: attestations.payloadHash,
      })
      .from(attestations)
      .where(eq(attestations.workVersionId, version.id));
    const duplicate = existing.find(
      (item) =>
        item.payloadHash === values.payloadHash && item.status !== "declined" && item.status !== "revoked",
    );
    if (duplicate) {
      throw new EvidenceError(
        "duplicate",
        duplicate.status === "pending_approval"
          ? "The same evidence is already waiting for the author's approval."
          : "The same evidence is already on this record.",
        duplicate.id,
      );
    }
    const added = existing.filter((item) => item.addedVia !== "registration" && item.status !== "declined");
    if (added.length >= MAX_ADDED_EVIDENCE) {
      throw new EvidenceError(
        "evidence-limit",
        `A version can take ${MAX_ADDED_EVIDENCE} additions after registration, and this one has them all.`,
      );
    }
    if (
      via === "api" &&
      existing.filter((item) => item.status === "pending_approval").length >= MAX_PENDING_EVIDENCE
    ) {
      throw new EvidenceError(
        "pending-limit",
        `${MAX_PENDING_EVIDENCE} submissions are already waiting for the author's approval on this record.`,
      );
    }

    const status = via === "api" ? ("pending_approval" as const) : ("active" as const);
    const [row] = await tx
      .insert(attestations)
      .values({
        workVersionId: version.id,
        ...values,
        submittedByUserId: userId,
        addedVia: via,
        status,
        createdAt: now,
      })
      .returning({ id: attestations.id });
    if (status === "active") {
      await tx.insert(recordEvents).values({
        proofRecordId: record.id,
        eventType: "evidence-added",
        actorUserId: userId,
        data: { evidenceId: row!.id, claimType: values.claimType, via },
        createdAt: now,
      });
    }
    return {
      evidenceId: row!.id,
      status,
      claimType: values.claimType,
      versionNumber: version.versionNumber,
      title: version.title,
    };
  });
}

/**
 * The author's decision on evidence an integration submitted. Approving makes
 * it public with an `evidence-added` event; declining is final and private.
 */
export async function reviewEvidence(
  db: Database,
  {
    proofId,
    evidenceId,
    userId,
    decision,
    now = new Date(),
  }: { proofId: string; evidenceId: string; userId: string; decision: "approve" | "decline"; now?: Date },
): Promise<{ claimType: string }> {
  return db.transaction(async (tx) => {
    const { record, version } = await lockOwnedRecord(tx, proofId, userId);
    const item = await findEvidence(tx, version.id, evidenceId);
    if (!item) throw new EvidenceError("not-found", "Evidence not found.");
    if (item.status !== "pending_approval") {
      throw new EvidenceError("not-pending", "This evidence has already been reviewed.");
    }
    if (decision === "approve" && record.status !== "registered") {
      throw new EvidenceError(
        "not-registered",
        "This record is withdrawn, so evidence can't be approved. You can decline it.",
      );
    }
    await tx
      .update(attestations)
      .set({ status: decision === "approve" ? "active" : "declined", reviewedAt: now })
      .where(eq(attestations.id, item.id));
    if (decision === "approve") {
      await tx.insert(recordEvents).values({
        proofRecordId: record.id,
        eventType: "evidence-added",
        actorUserId: userId,
        data: { evidenceId: item.id, claimType: item.claimType, via: item.addedVia },
        createdAt: now,
      });
    }
    return { claimType: item.claimType };
  });
}

/**
 * Revokes evidence added after registration. It stays on the record, struck
 * through and dated, with an `evidence-revoked` event. What the author
 * attested to at registration can't be revoked.
 */
export async function revokeEvidence(
  db: Database,
  {
    proofId,
    evidenceId,
    userId,
    note,
    now = new Date(),
  }: { proofId: string; evidenceId: string; userId: string; note?: string | null; now?: Date },
): Promise<{ claimType: string }> {
  const cleanNote = note?.trim().slice(0, 300) || null;
  return db.transaction(async (tx) => {
    const { record, version } = await lockOwnedRecord(tx, proofId, userId);
    if (record.status !== "registered") {
      throw new EvidenceError("not-registered", "This record is withdrawn and final.");
    }
    const item = await findEvidence(tx, version.id, evidenceId);
    if (!item) throw new EvidenceError("not-found", "Evidence not found.");
    if (item.addedVia === "registration") {
      throw new EvidenceError(
        "not-revocable",
        "Evidence submitted with the registration is part of what you attested to, so it stays as it is.",
      );
    }
    if (item.status !== "active" && item.status !== "disputed") {
      throw new EvidenceError(
        "not-revocable",
        item.status === "revoked" ? "This evidence is already revoked." : "This evidence isn't public.",
      );
    }
    await tx
      .update(attestations)
      .set({ status: "revoked", revokedAt: now, revokedByUserId: userId, revocationReason: cleanNote })
      .where(eq(attestations.id, item.id));
    await tx.insert(recordEvents).values({
      proofRecordId: record.id,
      eventType: "evidence-revoked",
      actorUserId: userId,
      data: { evidenceId: item.id, claimType: item.claimType, note: cleanNote },
      createdAt: now,
    });
    return { claimType: item.claimType };
  });
}

/** Evidence waiting for the user's approval across their registered records, oldest first. */
export async function listPendingEvidence(db: Database, userId: string) {
  return db
    .select({
      evidenceId: attestations.id,
      claimType: attestations.claimType,
      payload: attestations.payload,
      submittedAt: attestations.createdAt,
      proofId: proofRecords.publicId,
      title: workVersions.title,
      versionNumber: workVersions.versionNumber,
    })
    .from(attestations)
    .innerJoin(workVersions, eq(workVersions.id, attestations.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
    .where(
      and(
        eq(works.ownerId, userId),
        eq(attestations.status, "pending_approval"),
        eq(proofRecords.status, "registered"),
      ),
    )
    .orderBy(asc(attestations.createdAt));
}
