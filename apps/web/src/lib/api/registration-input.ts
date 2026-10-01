import type { RegistrationInput } from "@/lib/registration-validation";
import { apiError, ApiRequestError } from "./http";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const asJson = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

function invalid(detail: string, headers?: HeadersInit): never {
  throw new ApiRequestError(
    apiError(400, "invalid_request", "The registration is invalid.", { headers, details: [detail] }),
  );
}

/**
 * Maps an API request body onto the wizard's registration input. Envelopes
 * come as `envelopes: [...]` or, for compatibility, a single `envelope`, each
 * an object or a JSON string. `workDefaults` fill in `work` fields the body
 * leaves out, which is how a new version carries over its details.
 */
export function registrationInputFromBody(
  body: unknown,
  {
    headers,
    workDefaults = {},
  }: { headers?: HeadersInit; workDefaults?: Partial<RegistrationInput["work"]> } = {},
) {
  const { work, document, envelope, envelopes, ...rest } = isRecord(body) ? body : {};
  if (envelope !== undefined && envelopes !== undefined) {
    invalid("Send envelopes, or a single envelope, not both.", headers);
  }
  if (envelopes !== undefined && !Array.isArray(envelopes)) {
    invalid("envelopes: Expected an array of Proof Envelopes.", headers);
  }
  return {
    ...rest,
    work: { ...workDefaults, ...(isRecord(work) ? work : {}) },
    document: { ...(isRecord(document) ? document : {}), source: "api" },
    envelopesJson: Array.isArray(envelopes)
      ? envelopes.map(asJson)
      : envelope === undefined
        ? []
        : [asJson(envelope)],
  };
}
