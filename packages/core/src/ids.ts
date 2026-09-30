/**
 * Authoro identifiers.
 *
 * Proof IDs (e.g. `AU-7K3F92`) identify one registered version of a work and
 * are the public, printable handle a reader resolves at `/p/<id>`. Work IDs
 * (e.g. `AUW-4F8Q2M9C`) identify the conceptual work that versions belong to.
 *
 * Bodies use Crockford base32 (no I, L, O or U) so IDs survive being printed,
 * read aloud and retyped. Parsing is forgiving: it is case-insensitive, accepts
 * a missing hyphen or a pasted proof URL, and corrects the confusable letters
 * O → 0 and I/L → 1.
 */

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PROOF_ID_PREFIX = "AU";
export const WORK_ID_PREFIX = "AUW";

/** 32^6 ≈ 1.07 billion. Bodies can grow later; parsers accept 6–12 characters. */
export const PROOF_ID_LENGTH = 6;
export const WORK_ID_LENGTH = 8;

const MIN_BODY_LENGTH = 6;
const MAX_BODY_LENGTH = 12;

export function randomCrockford(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  // 256 is a multiple of 32, so masking the low 5 bits is unbiased.
  for (const byte of bytes) out += CROCKFORD_ALPHABET[byte & 31];
  return out;
}

export function generateProofId(length = PROOF_ID_LENGTH): string {
  return `${PROOF_ID_PREFIX}-${randomCrockford(length)}`;
}

export function generateWorkId(length = WORK_ID_LENGTH): string {
  return `${WORK_ID_PREFIX}-${randomCrockford(length)}`;
}

function normalizeBody(body: string): string | null {
  const cleaned = body.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (cleaned.length < MIN_BODY_LENGTH || cleaned.length > MAX_BODY_LENGTH) return null;
  for (const ch of cleaned) {
    if (!CROCKFORD_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

function prepare(input: string): string {
  const trimmed = input.trim();
  // Accept a pasted proof URL such as https://authoro.net/p/AU-7K3F92?ref=mark
  const fromUrl = trimmed.match(/\/p\/([^/?#\s]+)/i);
  return (fromUrl?.[1] ?? trimmed).replace(/\s+/g, "").toUpperCase();
}

/**
 * Parses user input into a canonical proof ID (`AU-XXXXXX`), or returns null.
 * A missing hyphen is tolerated, so `au7k3f92` resolves to `AU-7K3F92`.
 */
export function parseProofId(input: string): string | null {
  const match = prepare(input).match(/^AU-?([0-9A-Z]+)$/);
  if (!match?.[1]) return null;
  const body = normalizeBody(match[1]);
  return body ? `${PROOF_ID_PREFIX}-${body}` : null;
}

/** Parses user input into a canonical work ID (`AUW-XXXXXXXX`), or returns null. */
export function parseWorkId(input: string): string | null {
  const match = input.trim().replace(/\s+/g, "").toUpperCase().match(/^AUW-?([0-9A-Z]+)$/);
  if (!match?.[1]) return null;
  const body = normalizeBody(match[1]);
  return body ? `${WORK_ID_PREFIX}-${body}` : null;
}

export function isProofId(value: string): boolean {
  return parseProofId(value) === value;
}

export function isWorkId(value: string): boolean {
  return parseWorkId(value) === value;
}
