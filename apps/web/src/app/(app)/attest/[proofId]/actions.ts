"use server";

import { parseProofId } from "@authoro/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { discardPendingRegistration, finalizeRegistration, RegistrationError } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";
import { isEvidencePreset, parseAccessChoice } from "@/lib/visibility";

export interface AttestState {
  error?: string;
}

export async function attestAction(
  proofIdInput: string,
  _previous: AttestState,
  formData: FormData,
): Promise<AttestState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { error: "Registration not found." };
  const { session } = await requireAuthor(`/attest/${proofId}`);
  if (formData.get("agree") !== "on") return { error: "Tick the box to confirm your attestation." };
  const access = parseAccessChoice(formData);
  if (!access) return { error: "Choose who can see this record." };
  const evidencePreset = formData.get("evidenceDisclosure");
  if (!isEvidencePreset(evidencePreset)) return { error: "Choose how much evidence detail to show." };

  try {
    const { attestationHash } = await finalizeRegistration(db, {
      proofId,
      userId: session.user.id,
      typedName: String(formData.get("typedName") ?? ""),
      access,
      evidencePreset,
    });
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "registration.attested",
      targetType: "proof_record",
      targetId: proofId,
      metadata: { attestationHash, visibility: access.visibility, evidencePreset },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof RegistrationError) return { error: error.message };
    throw error;
  }
  redirect(`/dashboard?registered=${proofId}`);
}

export async function discardAction(proofIdInput: string): Promise<void> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) redirect("/dashboard");
  const { session } = await requireAuthor(`/attest/${proofId}`);
  try {
    await discardPendingRegistration(db, { proofId, userId: session.user.id });
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "registration.discarded",
      targetType: "proof_record",
      targetId: proofId,
      headers: await headers(),
    });
  } catch (error) {
    if (!(error instanceof RegistrationError)) throw error;
  }
  redirect("/dashboard");
}
