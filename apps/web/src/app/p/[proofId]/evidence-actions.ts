"use server";

import { parseProofId } from "@authoro/core";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { addEvidence, EvidenceError, reviewEvidence, revokeEvidence } from "@/lib/evidence";
import { validateEvidenceSubmission } from "@/lib/evidence-validation";
import { getOwnedRegistration } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";

export interface EvidenceFormState {
  errors?: string[];
  done?: boolean;
}

/**
 * The owner adds documentation links or a Proof Envelope to a registered
 * version. It's public at once, dated, and shown as added after the
 * attestation, which stays as it was.
 */
export async function addEvidenceAction(
  proofIdInput: string,
  input: { links?: unknown; envelope?: string; confirm?: boolean },
): Promise<EvidenceFormState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { errors: ["Record not found."] };
  const { session } = await requireAuthor(`/p/${proofId}`);
  if (input.confirm !== true) return { errors: ["Tick the box to add this to the public record."] };
  const registration = await getOwnedRegistration(db, proofId, session.user.id);
  if (!registration) return { errors: ["Record not found."] };

  const validation = validateEvidenceSubmission(
    input.envelope !== undefined ? { envelope: input.envelope } : { links: input.links },
    registration.version,
  );
  if (!validation.ok) return { errors: validation.errors };

  let added: Awaited<ReturnType<typeof addEvidence>>;
  try {
    added = await addEvidence(db, {
      proofId,
      userId: session.user.id,
      via: "author",
      submission: validation.submission,
    });
  } catch (error) {
    if (error instanceof EvidenceError) return { errors: [error.message] };
    throw error;
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "evidence.added",
    targetType: "proof_record",
    targetId: proofId,
    metadata: { evidenceId: added.evidenceId, claimType: added.claimType },
    headers: await headers(),
  });
  // Re-render in place: a redirect to the same path is ignored when the URL has a #fragment.
  refresh();
  return { done: true };
}

/** The owner approves or declines evidence an integration submitted. */
export async function reviewEvidenceAction(
  proofIdInput: string,
  evidenceId: string,
  decision: "approve" | "decline",
): Promise<EvidenceFormState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId || (decision !== "approve" && decision !== "decline"))
    return { errors: ["Record not found."] };
  const { session } = await requireAuthor(`/p/${proofId}`);
  try {
    const { claimType } = await reviewEvidence(db, {
      proofId,
      evidenceId,
      userId: session.user.id,
      decision,
    });
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: decision === "approve" ? "evidence.approved" : "evidence.declined",
      targetType: "proof_record",
      targetId: proofId,
      metadata: { evidenceId, claimType },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof EvidenceError) return { errors: [error.message] };
    throw error;
  }
  // Re-render in place: a redirect to the same path is ignored when the URL has a #fragment.
  refresh();
  return { done: true };
}

/** The owner revokes evidence added after registration. It stays visible, marked revoked. */
export async function revokeEvidenceAction(
  proofIdInput: string,
  evidenceId: string,
  _previous: EvidenceFormState,
  formData: FormData,
): Promise<EvidenceFormState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { errors: ["Record not found."] };
  const { session } = await requireAuthor(`/p/${proofId}`);
  if (formData.get("confirm") !== "on") return { errors: ["Tick the box to confirm the revocation."] };
  const note = String(formData.get("note") ?? "");
  try {
    const { claimType } = await revokeEvidence(db, { proofId, evidenceId, userId: session.user.id, note });
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "evidence.revoked",
      targetType: "proof_record",
      targetId: proofId,
      metadata: { evidenceId, claimType, note: Boolean(note.trim()) },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof EvidenceError) return { errors: [error.message] };
    throw error;
  }
  // Re-render in place: a redirect to the same path is ignored when the URL has a #fragment.
  refresh();
  return { done: true };
}
