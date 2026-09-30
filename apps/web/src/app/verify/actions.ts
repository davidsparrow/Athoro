"use server";

import { hashStringSchema, type MatchMethod } from "@authoro/core";
import { z } from "zod";
import { db } from "@/db";
import { findRegisteredByFingerprint } from "@/lib/registration";

const query = z.object({ contentHash: hashStringSchema, textHash: hashStringSchema.nullable() });

export interface PublicMatch {
  proofId: string;
  title: string;
  authorDisplayName: string;
  registeredAt: string | null;
  method: MatchMethod;
}

/** Public reverse lookup: which registered records match these fingerprints? */
export async function lookupFingerprintAction(input: unknown): Promise<PublicMatch[]> {
  const parsed = query.safeParse(input);
  if (!parsed.success) return [];
  const matches = await findRegisteredByFingerprint(db, parsed.data);
  return matches.map((match) => ({
    proofId: match.proofId,
    title: match.title,
    authorDisplayName: match.authorDisplayName,
    registeredAt: match.registeredAt?.toISOString() ?? null,
    method: match.contentHash === parsed.data.contentHash ? "exact-bytes" : "canonical-text",
  }));
}
