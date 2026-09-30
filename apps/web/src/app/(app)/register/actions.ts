"use server";

import { hashStringSchema } from "@authoro/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { findRegisteredByFingerprint, prepareRegistration } from "@/lib/registration";
import { validateRegistration } from "@/lib/registration-validation";
import { getSession, requireAuthor } from "@/lib/session";

export async function prepareRegistrationAction(input: unknown): Promise<{ errors: string[] }> {
  const { session, profile } = await requireAuthor("/register");
  const validation = validateRegistration(input);
  if (!validation.ok) return { errors: validation.errors };

  const { proofId, workId } = await prepareRegistration(db, {
    userId: session.user.id,
    profile,
    registration: validation.data,
  });
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "registration.prepared",
    targetType: "proof_record",
    targetId: proofId,
    metadata: {
      workId,
      source: validation.data.document.source,
      envelope: Boolean(validation.data.envelope),
    },
    headers: await headers(),
  });
  redirect(`/attest/${proofId}`);
}

const fingerprintQuery = z.object({ contentHash: hashStringSchema, textHash: hashStringSchema.nullable() });

export interface FingerprintMatch {
  proofId: string;
  title: string;
  authorDisplayName: string;
  registeredAt: string | null;
  mine: boolean;
}

/** Public registered records with the same fingerprint, so authors notice duplicates early. */
export async function checkFingerprintAction(input: unknown): Promise<FingerprintMatch[]> {
  const session = await getSession();
  const parsed = fingerprintQuery.safeParse(input);
  if (!session || !parsed.success) return [];
  const matches = await findRegisteredByFingerprint(db, parsed.data);
  return matches.map((match) => ({
    proofId: match.proofId,
    title: match.title,
    authorDisplayName: match.authorDisplayName,
    registeredAt: match.registeredAt?.toISOString() ?? null,
    mine: match.ownerId === session.user.id,
  }));
}
