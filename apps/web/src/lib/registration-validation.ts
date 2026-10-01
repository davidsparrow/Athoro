import {
  creationDisclosureSchema,
  hashStringSchema,
  workTypeSchema,
  type ProofEnvelope,
} from "@authoro/core";
import { z } from "zod";
import { checkEnvelopes, MAX_ENVELOPES } from "./evidence-validation";

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
  source: z.enum(["file", "text", "api"]),
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
  /** Proof Envelopes supplied by the author, as JSON text. Blank entries are ignored. */
  envelopesJson: z
    .array(z.string().max(70_000))
    .max(MAX_ENVELOPES, `Attach at most ${MAX_ENVELOPES} evidence envelopes.`)
    .default([]),
});

export type RegistrationInput = z.input<typeof registrationInputSchema>;
export type ValidRegistration = Omit<z.output<typeof registrationInputSchema>, "envelopesJson"> & {
  envelopes: ProofEnvelope[];
};

export type RegistrationValidation = { ok: true; data: ValidRegistration } | { ok: false; errors: string[] };

/**
 * Validates a registration, including that each attached envelope describes
 * the same document the author fingerprinted.
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

  const { envelopesJson, ...data } = parsed.data;
  const texts = envelopesJson.map((text) => text.trim()).filter(Boolean);
  const envelopes = checkEnvelopes(texts, data.document);
  if (!envelopes.ok) return { ok: false, errors: envelopes.errors };
  return { ok: true, data: { ...data, envelopes: envelopes.envelopes } };
}
