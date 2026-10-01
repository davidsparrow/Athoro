import { db } from "@/db";
import { apiError, handle, json, readJson, requireApiKey } from "@/lib/api/http";
import { registrationInputFromBody } from "@/lib/api/registration-input";
import { recordAudit } from "@/lib/audit";
import { getProfileByUserId } from "@/lib/profiles";
import { listWorksForUser, prepareRegistration } from "@/lib/registration";
import { validateRegistration } from "@/lib/registration-validation";
import { appOrigin, proofUrl } from "@/lib/urls";

/**
 * POST /api/v1/works: prepares a registration from fingerprints. The record
 * stays `pending_attestation` until the author opens `attestUrl` and attests
 * in person; an API key can never complete that step.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { key, headers } = await requireApiKey(request);
    const body = await readJson(request, headers);
    const validation = validateRegistration(registrationInputFromBody(body, { headers }));
    if (!validation.ok) {
      return apiError(400, "invalid_request", "The registration is invalid.", {
        headers,
        details: validation.errors,
      });
    }

    const profile = await getProfileByUserId(db, key.userId);
    if (!profile) {
      return apiError(
        409,
        "profile_required",
        "Finish setting up your author profile at /onboarding first.",
        {
          headers,
        },
      );
    }

    const { proofId, workId } = await prepareRegistration(db, {
      userId: key.userId,
      profile,
      registration: validation.data,
    });
    await recordAudit({
      actorType: "api_key",
      actorId: key.id,
      action: "registration.prepared",
      targetType: "proof_record",
      targetId: proofId,
      metadata: { workId, userId: key.userId, envelopes: validation.data.envelopes.length },
      headers: request.headers,
    });

    const origin = appOrigin();
    return json(
      {
        object: "registration",
        proofId,
        workId,
        version: 1,
        status: "pending_attestation",
        attestUrl: `${origin}/attest/${proofId}`,
        proofUrl: proofUrl(proofId, origin),
        message:
          "Prepared. The author must open attestUrl, review the details and attest before the record is public.",
      },
      { status: 201, headers: { ...headers, Location: `${origin}/attest/${proofId}` } },
    );
  });
}

/** GET /api/v1/works: the key owner's registrations, newest first. */
export async function GET(request: Request) {
  return handle(async () => {
    const { key, headers } = await requireApiKey(request);
    const origin = appOrigin();
    const works = await listWorksForUser(db, key.userId);
    return json(
      {
        data: works.map((work) => ({
          proofId: work.proofId,
          workId: work.workId,
          title: work.title,
          type: work.workType,
          version: work.versionNumber,
          status: work.status,
          registeredAt: work.registeredAt?.toISOString() ?? null,
          url:
            work.status === "pending_attestation"
              ? `${origin}/attest/${work.proofId}`
              : proofUrl(work.proofId, origin),
        })),
      },
      { headers },
    );
  });
}
