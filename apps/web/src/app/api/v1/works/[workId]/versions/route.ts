import { parseWorkId } from "@authoro/core";
import { db } from "@/db";
import { apiError, handle, json, readJson, requireApiKey } from "@/lib/api/http";
import { recordPresetsFromBody } from "@/lib/api/record-presets";
import { registrationInputFromBody } from "@/lib/api/registration-input";
import { recordAudit } from "@/lib/audit";
import { getProfileByUserId } from "@/lib/profiles";
import { getWorkForNewVersion, prepareVersion, RegistrationError } from "@/lib/registration";
import { validateRegistration } from "@/lib/registration-validation";
import { appOrigin, proofUrl } from "@/lib/urls";

/**
 * POST /api/v1/works/{workId}/versions: prepares the next version of one of
 * the key owner's works. `work` fields left out carry over from the latest
 * version, and the type is fixed by the work. Like POST /works, the version
 * stays `pending_attestation` until the author attests at `attestUrl`.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/works/[workId]/versions">) {
  return handle(async () => {
    const { key, headers } = await requireApiKey(request);
    const workId = parseWorkId(decodeURIComponent((await params).workId));
    if (!workId) {
      return apiError(400, "invalid_id", "That isn't an Authoro work ID (e.g. AUW-4F8Q2M9C).", { headers });
    }
    const body = await readJson(request, headers);
    const found = await getWorkForNewVersion(db, workId, key.userId);
    if (!found) return apiError(404, "not_found", `No work ${workId} in this account.`, { headers });

    const { work, latest } = found;
    const input = registrationInputFromBody(body, {
      headers,
      workDefaults: {
        title: latest?.title,
        canonicalUrl: latest?.canonicalUrl ?? "",
        description: latest?.description ?? "",
        workType: work.workType,
      },
    });
    if (input.work.workType !== work.workType) {
      return apiError(400, "invalid_request", "The registration is invalid.", {
        headers,
        details: [
          `work.workType: The type belongs to the work (${work.workType}) and can't change between versions.`,
        ],
      });
    }
    const validation = validateRegistration(input);
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

    const presets = await recordPresetsFromBody(db, body, { userId: key.userId, headers });
    let prepared: Awaited<ReturnType<typeof prepareVersion>>;
    try {
      prepared = await prepareVersion(db, {
        userId: key.userId,
        profile,
        workPublicId: workId,
        registration: validation.data,
        presets,
      });
    } catch (error) {
      if (!(error instanceof RegistrationError)) throw error;
      if (error.code === "draft-exists" || error.code === "unchanged") {
        return apiError(409, error.code === "draft-exists" ? "draft_exists" : "unchanged", error.message, {
          headers,
          proofId: error.proofId,
        });
      }
      if (error.code === "not-found") {
        return apiError(404, "not_found", `No work ${workId} in this account.`, { headers });
      }
      throw error;
    }
    const { proofId, versionNumber } = prepared;
    await recordAudit({
      actorType: "api_key",
      actorId: key.id,
      action: "registration.prepared",
      targetType: "proof_record",
      targetId: proofId,
      metadata: {
        workId,
        versionNumber,
        userId: key.userId,
        envelopes: validation.data.envelopes.length,
      },
      headers: request.headers,
    });

    const origin = appOrigin();
    return json(
      {
        object: "registration",
        proofId,
        workId,
        version: versionNumber,
        status: "pending_attestation",
        record: {
          visibility: presets.access.visibility,
          embargoUntil: presets.access.embargoUntil?.toISOString() ?? null,
          showFingerprint: presets.access.embargoShowsFingerprint,
          evidenceDisclosure: presets.evidencePreset,
        },
        attestUrl: `${origin}/attest/${proofId}`,
        proofUrl: proofUrl(proofId, origin),
        message: `Prepared version ${versionNumber}. The author must open attestUrl, review the details and attest before the record is public.`,
      },
      { status: 201, headers: { ...headers, Location: `${origin}/attest/${proofId}` } },
    );
  });
}
