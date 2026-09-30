import { compareFingerprints, hashStringSchema, parseProofId } from "@authoro/core";
import { z } from "zod";
import { db } from "@/db";
import { apiError, handle, json, limitPublicRequest, preflight, readJson } from "@/lib/api/http";
import { getPublicProof } from "@/lib/proof";
import { findRegisteredByFingerprint } from "@/lib/registration";
import { appOrigin, proofUrl } from "@/lib/urls";

export const OPTIONS = preflight;

const bodySchema = z
  .object({
    proofId: z.string().max(200).optional(),
    contentHash: hashStringSchema.optional(),
    textHash: hashStringSchema.optional(),
  })
  .refine((body) => body.proofId || body.contentHash || body.textHash, {
    message: "Send a proofId, a contentHash or textHash, or both.",
  });

/**
 * POST /api/v1/verify. With `proofId`: is this record valid, and do the given
 * hashes match it (or another version of the work)? Without: which public
 * records match these hashes? Callers hash documents themselves; content is
 * never sent.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { headers } = await limitPublicRequest(request);
    const parsed = bodySchema.safeParse(await readJson(request, headers));
    if (!parsed.success) {
      return apiError(400, "invalid_request", "The request body is invalid.", {
        headers,
        details: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
        ),
      });
    }
    const { proofId: rawId, contentHash, textHash } = parsed.data;
    const candidate = { contentHash: contentHash ?? null, textHash: textHash ?? null };
    const origin = appOrigin();

    if (rawId) {
      const proofId = parseProofId(rawId);
      if (!proofId)
        return apiError(400, "invalid_id", "That isn't an Authoro ID (e.g. AU-7K3F92).", { headers });
      const proof = await getPublicProof(db, proofId);
      if (proof?.kind !== "record") {
        return json({ proof: null, valid: false, match: null }, { headers });
      }
      const hashed = Boolean(contentHash || textHash);
      const versions = [...proof.versions].sort((a, b) =>
        a.proofId === proofId ? -1 : b.proofId === proofId ? 1 : b.versionNumber - a.versionNumber,
      );
      const hit = hashed
        ? versions
            .map((version) => ({ version, result: compareFingerprints(version, candidate) }))
            .find(({ result }) => result.matched)
        : undefined;
      return json(
        {
          proof: { id: proofId, status: proof.record.status, url: proofUrl(proofId, origin) },
          valid: proof.record.status === "registered",
          match: hashed
            ? hit?.result.matched
              ? {
                  matched: true,
                  method: hit.result.method,
                  proofId: hit.version.proofId,
                  version: hit.version.versionNumber,
                  sameVersion: hit.version.proofId === proofId,
                }
              : { matched: false }
            : null,
        },
        { headers },
      );
    }

    const matches = await findRegisteredByFingerprint(db, candidate);
    return json(
      {
        matches: matches.map((match) => ({
          proofId: match.proofId,
          url: proofUrl(match.proofId, origin),
          title: match.title,
          author: match.authorDisplayName,
          registeredAt: match.registeredAt?.toISOString() ?? null,
          method: contentHash && match.contentHash === contentHash ? "exact-bytes" : "canonical-text",
        })),
      },
      { headers },
    );
  });
}
