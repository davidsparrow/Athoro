"use server";

import { parseProofId } from "@authoro/core";
import { db } from "@/db";
import { getProofStatus, incrementMetric } from "@/lib/proof";

/** Counts a reader check. Only the count is stored, never the document or its hash. */
export async function recordVerificationAction(proofIdInput: string): Promise<void> {
  const proofId = parseProofId(proofIdInput);
  const record = proofId ? await getProofStatus(db, proofId) : null;
  if (record && record.status !== "pending_attestation")
    await incrementMetric(db, record.id, "verifications");
}
