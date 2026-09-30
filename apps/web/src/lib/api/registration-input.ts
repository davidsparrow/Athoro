import type { RegistrationInput } from "@/lib/registration-validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps an API request body onto the wizard's registration input. `envelope`
 * may be an object or a JSON string. `workDefaults` fill in `work` fields the
 * body leaves out, which is how a new version carries over its details.
 */
export function registrationInputFromBody(
  body: unknown,
  workDefaults: Partial<RegistrationInput["work"]> = {},
) {
  const { work, document, envelope, ...rest } = isRecord(body) ? body : {};
  return {
    ...rest,
    work: { ...workDefaults, ...(isRecord(work) ? work : {}) },
    document: { ...(isRecord(document) ? document : {}), source: "api" },
    envelopeJson:
      envelope === undefined ? undefined : typeof envelope === "string" ? envelope : JSON.stringify(envelope),
  };
}
