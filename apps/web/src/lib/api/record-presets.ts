import { z } from "zod";
import type { Database } from "@/db/client";
import { getPlan } from "@/lib/entitlements";
import {
  accessChoiceProblem,
  choiceNeedsPro,
  type AccessChoice,
  type EvidencePreset,
} from "@/lib/visibility";
import { apiError, ApiRequestError } from "./http";

const recordPresetsSchema = z
  .object({
    visibility: z.enum(["public", "unlisted", "private"]).default("public"),
    /** A scheduled release for a private record (an embargo). */
    embargoUntil: z.iso.datetime({ offset: true }).nullable().default(null),
    /** Whether the embargo notice shows the document's fingerprints. */
    showFingerprint: z.boolean().default(false),
    evidenceDisclosure: z.enum(["minimal", "standard", "detailed"]).default("standard"),
  })
  .strict();

export interface RecordPresets {
  access: AccessChoice;
  evidencePreset: EvidencePreset;
}

function invalid(details: string[], headers?: HeadersInit): never {
  throw new ApiRequestError(
    apiError(400, "invalid_request", "The registration is invalid.", { headers, details }),
  );
}

/**
 * Who should see a prepared record, from the body's optional `record` object.
 * These are suggestions: the author confirms or changes them when attesting.
 * Anything but a public record needs Pro, checked here so integrations learn early.
 */
export async function recordPresetsFromBody(
  db: Database,
  body: unknown,
  { userId, headers, now = new Date() }: { userId: string; headers?: HeadersInit; now?: Date },
): Promise<RecordPresets> {
  const raw = typeof body === "object" && body !== null ? (body as { record?: unknown }).record : undefined;
  const parsed = recordPresetsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    invalid(
      parsed.error.issues.map((issue) => `record.${issue.path.join(".")}: ${issue.message}`),
      headers,
    );
  }
  const { visibility, embargoUntil, showFingerprint, evidenceDisclosure } = parsed.data;
  const access: AccessChoice = {
    visibility,
    embargoUntil: embargoUntil ? new Date(embargoUntil) : null,
    embargoShowsFingerprint: Boolean(embargoUntil) && showFingerprint,
  };
  const problem = accessChoiceProblem(access, { published: false, now });
  if (problem) invalid([`record: ${problem}`], headers);
  if (choiceNeedsPro(access) && (await getPlan(db, userId)) !== "pro") {
    throw new ApiRequestError(
      apiError(
        403,
        "plan_required",
        "Private, unlisted and embargoed records are part of Authoro Pro. Public records are always free.",
        { headers },
      ),
    );
  }
  return { access, evidencePreset: evidenceDisclosure };
}
