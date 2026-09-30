"use server";

import { parseProofId } from "@authoro/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { getProofStatus, incrementMetric } from "@/lib/proof";
import { isWithdrawalReason, RegistrationError, withdrawRecord } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";

/** Counts a reader check. Only the count is stored, never the document or its hash. */
export async function recordVerificationAction(proofIdInput: string): Promise<void> {
  const proofId = parseProofId(proofIdInput);
  const record = proofId ? await getProofStatus(db, proofId) : null;
  if (record && record.status !== "pending_attestation")
    await incrementMetric(db, record.id, "verifications");
}

export interface WithdrawState {
  error?: string;
}

/** The owner withdraws a registered record. Final: the record stays public, marked withdrawn. */
export async function withdrawAction(
  proofIdInput: string,
  _previous: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { error: "Record not found." };
  const { session } = await requireAuthor(`/p/${proofId}`);
  const reason = formData.get("reason");
  if (!isWithdrawalReason(reason)) return { error: "Choose a reason for withdrawing." };
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm that withdrawal is final." };
  const note = String(formData.get("note") ?? "");

  try {
    await withdrawRecord(db, { proofId, userId: session.user.id, reason, note });
  } catch (error) {
    if (error instanceof RegistrationError) return { error: error.message };
    throw error;
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "record.withdrawn",
    targetType: "proof_record",
    targetId: proofId,
    metadata: { reason, note: Boolean(note.trim()) },
    headers: await headers(),
  });
  redirect(`/p/${proofId}`);
}
