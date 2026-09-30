import {
  creationDisclosureSchema,
  hashStringSchema,
  parseProofEnvelope,
  workTypeSchema,
  type ProofEnvelope,
} from "@authoro/core";
import { z } from "zod";

/** Browsers hash whole files in memory, so V0 caps documents at 100 MB. */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500, "URLs can be at most 500 characters.")
  .refine(
    (value) => value === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value),
    "Enter a full URL starting with https://",
  )
  .transform((value) => value || null);

export const workDetailsSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(300, "Titles can be at most 300 characters."),
  workType: workTypeSchema,
  canonicalUrl: optionalHttpUrl,
  description: z
    .string()
    .trim()
    .max(2000, "Descriptions can be at most 2,000 characters.")
    .transform((value) => value || null),
});

/** Fingerprints computed in the author's browser; the document itself is never uploaded. */
export const documentFingerprintSchema = z.object({
  source: z.enum(["file", "text"]),
  contentHash: hashStringSchema,
  textHash: hashStringSchema.nullable(),
  mediaType: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, "Invalid media type."),
  byteLength: z.number().int().min(1, "The document is empty.").max(MAX_DOCUMENT_BYTES),
  wordCount: z.number().int().min(0).nullable(),
});

export const registrationInputSchema = z.object({
  work: workDetailsSchema,
  document: documentFingerprintSchema,
  disclosure: creationDisclosureSchema,
  /** Optional Proof Envelope JSON supplied by the author. */
  envelopeJson: z.string().max(70_000).optional(),
});

export type RegistrationInput = z.input<typeof registrationInputSchema>;
export type ValidRegistration = z.output<typeof registrationInputSchema> & { envelope: ProofEnvelope | null };

export type RegistrationValidation = { ok: true; data: ValidRegistration } | { ok: false; errors: string[] };

/**
 * Validates a registration, including that an attached envelope describes the
 * same document the author fingerprinted.
 */
export function validateRegistration(input: unknown): RegistrationValidation {
  const parsed = registrationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  }

  const envelopeText = parsed.data.envelopeJson?.trim();
  if (!envelopeText) return { ok: true, data: { ...parsed.data, envelope: null } };

  const envelopeResult = parseProofEnvelope(envelopeText);
  if (!envelopeResult.ok) {
    return { ok: false, errors: envelopeResult.errors.map((error) => `Evidence envelope: ${error}`) };
  }
  const { envelope } = envelopeResult;
  const { contentHash, textHash } = parsed.data.document;
  const matches =
    envelope.work.hash === contentHash ||
    (textHash !== null && (envelope.work.hash === textHash || envelope.work.textHash === textHash));
  if (!matches) {
    return {
      ok: false,
      errors: ["Evidence envelope: it describes a different document (its work.hash doesn't match yours)."],
    };
  }
  return { ok: true, data: { ...parsed.data, envelope } };
}
