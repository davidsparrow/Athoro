import { parseProofId } from "@authoro/core";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { apiError, handle, json, readJson, requireApiKey } from "@/lib/api/http";
import { recordAudit } from "@/lib/audit";
import { sendLater } from "@/lib/email/later";
import { evidenceSubmittedEmail } from "@/lib/email/templates";
import { addEvidence, EvidenceError } from "@/lib/evidence";
import { validateEvidenceSubmission } from "@/lib/evidence-validation";
import { getOwnedRegistration } from "@/lib/registration";
import { appOrigin, proofUrl } from "@/lib/urls";

const CONFLICTS = {
  "not-registered": "not_registered",
  duplicate: "duplicate_evidence",
  "pending-limit": "pending_limit",
  "evidence-limit": "evidence_limit",
} as const;

/**
 * POST /api/v1/proofs/{id}/evidence: adds evidence to one of the key owner's
 * registered records, either links to documentation or a Proof Envelope. It
 * waits for the author's approval and is never public before that, so an API
 * key can't change what a record says on its own.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/proofs/[proofId]/evidence">) {
  return handle(async () => {
    const { key, headers } = await requireApiKey(request);
    const proofId = parseProofId(decodeURIComponent((await params).proofId));
    if (!proofId) {
      return apiError(400, "invalid_id", "That isn't an Authoro ID (e.g. AU-7K3F92).", { headers });
    }
    const body = await readJson(request, headers);
    const registration = await getOwnedRegistration(db, proofId, key.userId);
    if (!registration)
      return apiError(404, "not_found", `No record ${proofId} in this account.`, { headers });

    const validation = validateEvidenceSubmission(body, registration.version);
    if (!validation.ok) {
      return apiError(400, "invalid_request", "The evidence is invalid.", {
        headers,
        details: validation.errors,
      });
    }

    let added: Awaited<ReturnType<typeof addEvidence>>;
    try {
      added = await addEvidence(db, {
        proofId,
        userId: key.userId,
        via: "api",
        submission: validation.submission,
      });
    } catch (error) {
      if (!(error instanceof EvidenceError)) throw error;
      if (error.code === "not-found") {
        return apiError(404, "not_found", `No record ${proofId} in this account.`, { headers });
      }
      if (error.code === "mismatch") {
        return apiError(400, "invalid_request", "The evidence is invalid.", {
          headers,
          details: [error.message],
        });
      }
      if (error.code in CONFLICTS) {
        return apiError(409, CONFLICTS[error.code as keyof typeof CONFLICTS], error.message, {
          headers,
          evidenceId: error.evidenceId,
        });
      }
      throw error;
    }

    const origin = appOrigin();
    const reviewUrl = `${proofUrl(proofId, origin)}#review`;
    await recordAudit({
      actorType: "api_key",
      actorId: key.id,
      action: "evidence.submitted",
      targetType: "proof_record",
      targetId: proofId,
      metadata: { evidenceId: added.evidenceId, claimType: added.claimType, userId: key.userId },
      headers: request.headers,
    });
    const [owner] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, key.userId))
      .limit(1);
    if (owner) {
      const { submission } = validation;
      sendLater(
        evidenceSubmittedEmail(owner.email, owner.name, {
          issuer: submission.kind === "envelope" ? submission.envelope.issuer.name : null,
          keyName: key.name,
          title: added.title,
          versionNumber: added.versionNumber,
          proofId,
          reviewUrl,
        }),
      );
    }

    return json(
      {
        object: "evidence",
        id: added.evidenceId,
        proofId,
        status: added.status,
        reviewUrl,
        message: "Submitted. It stays off the public record until the author approves it at reviewUrl.",
      },
      { status: 201, headers },
    );
  });
}
