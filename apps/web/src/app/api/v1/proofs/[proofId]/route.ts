import { parseProofId } from "@authoro/core";
import { db } from "@/db";
import { apiError, handle, json, limitPublicRequest, preflight } from "@/lib/api/http";
import { serializePublicProof } from "@/lib/api/serialize";
import { getPublicProof } from "@/lib/proof";
import { appOrigin } from "@/lib/urls";

export const OPTIONS = preflight;

/** GET /api/v1/proofs/{id}: the public record as JSON. No key required. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/proofs/[proofId]">) {
  return handle(async () => {
    const { headers } = await limitPublicRequest(request);
    const proofId = parseProofId(decodeURIComponent((await params).proofId));
    if (!proofId)
      return apiError(400, "invalid_id", "That isn't an Authoro ID (e.g. AU-7K3F92).", { headers });
    const proof = await getPublicProof(db, proofId);
    if (proof?.kind !== "record")
      return apiError(404, "not_found", `No public record ${proofId}.`, { headers });
    return json(await serializePublicProof(proof, appOrigin()), {
      headers: {
        ...headers,
        "Cache-Control": "public, max-age=60",
        ...(proof.record.visibility === "unlisted" ? { "X-Robots-Tag": "noindex" } : {}),
      },
    });
  });
}
