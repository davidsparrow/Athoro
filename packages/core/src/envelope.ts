/**
 * The Proof Envelope: the normalized provenance package Authoro accepts from
 * any evidence provider. Only the schema, issuer, work hash and evidence
 * method are required; providers may attach richer evidence.
 *
 * Signatures are carried but not yet verified (issuer signing keys arrive in
 * V1). Until then, unsigned envelopes are displayed as unverified claims
 * attributed to the named issuer.
 */

import { z } from "zod";
import { evidenceClassSchema } from "./evidence";

export const PROOF_ENVELOPE_SCHEMA = "authoro-proof/1.0";

export const hashStringSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "Expected a hash of the form sha256:<64 lowercase hex characters>");

const timestampSchema = z.iso.datetime({ offset: true });

export const proofEnvelopeSchema = z.object({
  schema: z.literal(PROOF_ENVELOPE_SCHEMA),
  issuer: z.object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
  }),
  work: z.object({
    title: z.string().trim().max(500).optional(),
    hash: hashStringSchema,
    textHash: hashStringSchema.optional(),
    mediaType: z.string().trim().max(255).optional(),
  }),
  author: z
    .object({
      displayName: z.string().trim().max(200).optional(),
    })
    .optional(),
  timeline: z
    .object({
      startedAt: timestampSchema.optional(),
      completedAt: timestampSchema.optional(),
    })
    .optional(),
  evidence: z.looseObject({
    class: evidenceClassSchema.optional(),
    method: z.string().trim().min(1).max(100),
  }),
  signature: z.string().max(10_000).optional(),
});

export type ProofEnvelope = z.infer<typeof proofEnvelopeSchema>;

/** Maximum serialized size Authoro accepts for a single envelope. */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

export type EnvelopeParseResult = { ok: true; envelope: ProofEnvelope } | { ok: false; errors: string[] };

/** Parses and validates a Proof Envelope from JSON text or an already-parsed value. */
export function parseProofEnvelope(input: string | unknown): EnvelopeParseResult {
  let value: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).byteLength > MAX_ENVELOPE_BYTES) {
      return { ok: false, errors: [`Envelope exceeds ${MAX_ENVELOPE_BYTES / 1024} KB`] };
    }
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["Envelope is not valid JSON"] };
    }
  }
  const result = proofEnvelopeSchema.safeParse(value);
  if (result.success) return { ok: true, envelope: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    ),
  };
}
