/**
 * Author attestation: the human step that finalizes a registration.
 *
 * Agents and integrations may prepare a registration, but only the
 * authenticated creator can complete the attestation. The attestation is
 * recorded as its own evidence object, bound to the exact version hash and to
 * the version of the statement the creator agreed to. Its canonical-JSON hash
 * lets anyone check that the stored attestation has not been altered.
 */

import { hashCanonicalJson } from "./canonical-json";
import { formatHash, sha256Hex } from "./fingerprint";

export const AUTHOR_ATTESTATION_SCHEMA = "authoro-author-attestation/1.0";

export const AUTHOR_ATTESTATION_STATEMENTS = {
  "1.0": {
    statement:
      "I attest that, to the best of my knowledge, the information submitted for this Authoro record is true, accurate, and complete.",
    notice:
      "Authoro records provenance claims and supporting evidence but does not independently guarantee the truth, authorship, ownership, originality, or legal status of information submitted by users or third parties.",
  },
} as const;

export type AttestationStatementVersion = keyof typeof AUTHOR_ATTESTATION_STATEMENTS;
export const CURRENT_ATTESTATION_STATEMENT_VERSION: AttestationStatementVersion = "1.0";

/** Collapses whitespace and applies NFC; used before comparing or hashing typed names. */
export function normalizeTypedName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Hashes the typed legal name with a per-record secret salt. The name itself
 * is never published; holding the salt lets Authoro later confirm what was
 * typed without storing it in the clear. Case-insensitive.
 */
export async function hashLegalName(name: string, salt: string): Promise<string> {
  return formatHash(await sha256Hex(`${salt}:${normalizeTypedName(name).toLowerCase()}`));
}

export interface AuthorAttestation {
  type: "author-attestation";
  schema: typeof AUTHOR_ATTESTATION_SCHEMA;
  /** Proof ID of the version being attested, e.g. `AU-7K3F92`. */
  proofId: string;
  /** Exact-bytes fingerprint of the version. */
  contentHash: string;
  /** Canonical-text fingerprint, when the version has one. */
  textHash?: string;
  /** Authoro account that attested. */
  account: string;
  /** Hash of the creator's creation disclosure, binding it to this attestation. */
  disclosureHash?: string;
  legalNameHash: string;
  statementVersion: AttestationStatementVersion;
  /** Hash of the exact statement text shown to the creator. */
  statementHash: string;
  signedAt: string;
}

export async function hashAttestationStatement(
  version: AttestationStatementVersion,
): Promise<string> {
  const { statement, notice } = AUTHOR_ATTESTATION_STATEMENTS[version];
  return formatHash(await sha256Hex(`${statement}\n\n${notice}`));
}

export async function buildAuthorAttestation(input: {
  proofId: string;
  contentHash: string;
  textHash?: string | null;
  account: string;
  disclosureHash?: string | null;
  legalNameHash: string;
  signedAt: Date;
  statementVersion?: AttestationStatementVersion;
}): Promise<{ attestation: AuthorAttestation; attestationHash: string }> {
  const statementVersion = input.statementVersion ?? CURRENT_ATTESTATION_STATEMENT_VERSION;
  const attestation: AuthorAttestation = {
    type: "author-attestation",
    schema: AUTHOR_ATTESTATION_SCHEMA,
    proofId: input.proofId,
    contentHash: input.contentHash,
    ...(input.textHash ? { textHash: input.textHash } : {}),
    account: input.account,
    ...(input.disclosureHash ? { disclosureHash: input.disclosureHash } : {}),
    legalNameHash: input.legalNameHash,
    statementVersion,
    statementHash: await hashAttestationStatement(statementVersion),
    signedAt: input.signedAt.toISOString(),
  };
  return { attestation, attestationHash: await hashCanonicalJson(attestation) };
}
