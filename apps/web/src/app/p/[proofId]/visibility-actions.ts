"use server";

import { parseProofId } from "@authoro/core";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { requireAuthor } from "@/lib/session";
import {
  changeEvidencePreset,
  changeRecordAccess,
  isEvidencePreset,
  parseAccessChoice,
  VisibilityError,
} from "@/lib/visibility";

export interface VisibilityState {
  error?: string;
  saved?: string;
}

/** The owner changes who can see a registered record. Every change is a public record event. */
export async function changeAccessAction(
  proofIdInput: string,
  _previous: VisibilityState,
  formData: FormData,
): Promise<VisibilityState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { error: "Record not found." };
  const { session } = await requireAuthor(`/p/${proofId}`);
  const choice = parseAccessChoice(formData);
  if (!choice) return { error: "Choose who can see this record." };

  try {
    const { changed } = await changeRecordAccess(db, {
      proofId,
      userId: session.user.id,
      choice,
      confirmedRestriction: formData.get("confirmRestrict") === "on",
    });
    if (!changed) return { saved: "Nothing changed." };
  } catch (error) {
    if (error instanceof VisibilityError) return { error: error.message };
    throw error;
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "record.visibility_changed",
    targetType: "proof_record",
    targetId: proofId,
    metadata: { visibility: choice.visibility, embargoUntil: choice.embargoUntil?.toISOString() ?? null },
    headers: await headers(),
  });
  refresh();
  return { saved: "Saved. The change is recorded in this record's history." };
}

/** The owner changes how much evidence detail the record shows. */
export async function changePresetAction(
  proofIdInput: string,
  _previous: VisibilityState,
  formData: FormData,
): Promise<VisibilityState> {
  const proofId = parseProofId(proofIdInput);
  if (!proofId) return { error: "Record not found." };
  const { session } = await requireAuthor(`/p/${proofId}`);
  const preset = formData.get("evidenceDisclosure");
  if (!isEvidencePreset(preset)) return { error: "Choose how much evidence detail to show." };

  try {
    const { changed } = await changeEvidencePreset(db, { proofId, userId: session.user.id, preset });
    if (!changed) return { saved: "Nothing changed." };
  } catch (error) {
    if (error instanceof VisibilityError) return { error: error.message };
    throw error;
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "record.evidence_preset_changed",
    targetType: "proof_record",
    targetId: proofId,
    metadata: { preset },
    headers: await headers(),
  });
  refresh();
  return { saved: "Saved. The change is recorded in this record's history." };
}
