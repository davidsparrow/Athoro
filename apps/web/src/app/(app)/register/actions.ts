"use server";

import { hashStringSchema, parseWorkId } from "@authoro/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import {
  findRegisteredByFingerprint,
  prepareRegistration,
  prepareVersion,
  RegistrationError,
} from "@/lib/registration";
import { validateRegistration } from "@/lib/registration-validation";
import { getSession, requireAuthor } from "@/lib/session";

export interface PrepareResult {
  errors: string[];
  /** A draft or an identical earlier version that stops a new version. */
  conflict?: { code: "draft-exists" | "unchanged"; proofId: string };
}

export async function prepareRegistrationAction(input: unknown): Promise<PrepareResult> {
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
      envelopes: validation.data.envelopes.length,
    },
    headers: await headers(),
  });
  redirect(`/attest/${proofId}`);
}

/** Prepares the next version of one of the author's works, then sends them to attest it. */
export async function prepareVersionAction(workIdInput: string, input: unknown): Promise<PrepareResult> {
  const workId = parseWorkId(workIdInput);
  if (!workId) return { errors: ["Work not found."] };
  const { session, profile } = await requireAuthor(`/register?work=${workId}`);
  const validation = validateRegistration(input);
  if (!validation.ok) return { errors: validation.errors };

  let prepared: Awaited<ReturnType<typeof prepareVersion>>;
  try {
    prepared = await prepareVersion(db, {
      userId: session.user.id,
      profile,
      workPublicId: workId,
      registration: validation.data,
    });
  } catch (error) {
    if (!(error instanceof RegistrationError)) throw error;
    const { code, proofId } = error;
    return {
      errors: [error.message],
      ...((code === "draft-exists" || code === "unchanged") && proofId
        ? { conflict: { code, proofId } }
        : {}),
    };
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "registration.prepared",
    targetType: "proof_record",
    targetId: prepared.proofId,
    metadata: {
      workId,
      versionNumber: prepared.versionNumber,
      source: validation.data.document.source,
      envelopes: validation.data.envelopes.length,
    },
    headers: await headers(),
  });
  redirect(`/attest/${prepared.proofId}`);
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
