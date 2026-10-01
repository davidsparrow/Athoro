import {
  canonicalJson,
  documentationSchema,
  parseProofEnvelope,
  type DocumentationLink,
  type ProofEnvelope,
} from "@authoro/core";

/** Proof Envelopes the author can attach to one version at registration. */
export const MAX_ENVELOPES = 5;

/** The fingerprints an envelope must describe. */
export interface DocumentHashes {
  contentHash: string;
  textHash: string | null;
}

/** An envelope describes a document when its `work.hash` matches either fingerprint. */
export function envelopeMatches(envelope: ProofEnvelope, document: DocumentHashes): boolean {
  if (envelope.work.hash === document.contentHash) return true;
  return (
    document.textHash !== null &&
    (envelope.work.hash === document.textHash || envelope.work.textHash === document.textHash)
  );
}

export type EnvelopeCheck = { ok: true; envelope: ProofEnvelope } | { ok: false; errors: string[] };

/** Parses a Proof Envelope (JSON text or a value) and checks it describes `document`. */
export function checkEnvelope(input: unknown, document: DocumentHashes): EnvelopeCheck {
  const result = parseProofEnvelope(input);
  if (!result.ok) return result;
  if (!envelopeMatches(result.envelope, document)) {
    return {
      ok: false,
      errors: ["it describes a different document (its work.hash doesn't match yours)."],
    };
  }
  return result;
}

/**
 * Parses the envelopes attached to one version. Errors name the envelope
 * ("Evidence envelope 2: …") when there are several.
 */
export function checkEnvelopes(
  inputs: unknown[],
  document: DocumentHashes,
): { ok: true; envelopes: ProofEnvelope[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const envelopes: ProofEnvelope[] = [];
  const seen = new Set<string>();
  inputs.forEach((input, index) => {
    const prefix = inputs.length > 1 ? `Evidence envelope ${index + 1}` : "Evidence envelope";
    const result = checkEnvelope(input, document);
    if (!result.ok) {
      errors.push(...result.errors.map((error) => `${prefix}: ${error}`));
      return;
    }
    const canonical = canonicalJson(result.envelope);
    if (seen.has(canonical)) errors.push(`${prefix}: it's the same as an earlier envelope.`);
    seen.add(canonical);
    envelopes.push(result.envelope);
  });
  return errors.length ? { ok: false, errors } : { ok: true, envelopes };
}

/** Evidence added to a registered version: the author's documentation links, or a Proof Envelope. */
export type EvidenceSubmission =
  { kind: "documentation"; links: DocumentationLink[] } | { kind: "envelope"; envelope: ProofEnvelope };

export type EvidenceValidation =
  { ok: true; submission: EvidenceSubmission } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates one addition to a registered version: `{ links: [...] }` for
 * documentation, or `{ envelope }` (an object or JSON text) for a Proof
 * Envelope describing the version's document.
 */
export function validateEvidenceSubmission(input: unknown, document: DocumentHashes): EvidenceValidation {
  const body = isRecord(input) ? input : {};
  const hasEnvelope = body.envelope !== undefined && body.envelope !== null && body.envelope !== "";
  const hasLinks = body.links !== undefined && body.links !== null;
  if (hasEnvelope && hasLinks) return { ok: false, errors: ["Send either links or envelope, not both."] };
  if (!hasEnvelope && !hasLinks) {
    return { ok: false, errors: ["Send links to your documentation, or an envelope (a Proof Envelope)."] };
  }
  if (hasEnvelope) {
    const result = checkEnvelope(body.envelope, document);
    return result.ok
      ? { ok: true, submission: { kind: "envelope", envelope: result.envelope } }
      : { ok: false, errors: result.errors.map((error) => `Evidence envelope: ${error}`) };
  }
  const parsed = documentationSchema.safeParse({ links: body.links });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  }
  return { ok: true, submission: { kind: "documentation", links: parsed.data.links } };
}
