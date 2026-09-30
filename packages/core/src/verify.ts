/**
 * Checking a candidate document against a registered version.
 *
 * Verification compares fingerprints, never content, so a verifier can hash a
 * document locally and send only the hashes.
 */

export type MatchMethod = "exact-bytes" | "canonical-text";

export interface RegisteredFingerprints {
  contentHash: string;
  textHash?: string | null;
}

export interface CandidateFingerprints {
  contentHash?: string | null;
  textHash?: string | null;
}

export type MatchResult = { matched: true; method: MatchMethod } | { matched: false; method: null };

/**
 * An exact byte match is the strongest result and is checked first. A
 * canonical-text match means the words and their order are identical under
 * `authoro-text/1`, while formatting, encoding or typography may differ.
 */
export function compareFingerprints(
  registered: RegisteredFingerprints,
  candidate: CandidateFingerprints,
): MatchResult {
  if (candidate.contentHash && candidate.contentHash === registered.contentHash) {
    return { matched: true, method: "exact-bytes" };
  }
  if (candidate.textHash && registered.textHash && candidate.textHash === registered.textHash) {
    return { matched: true, method: "canonical-text" };
  }
  return { matched: false, method: null };
}

export const MATCH_METHOD_DESCRIPTIONS: Record<MatchMethod, string> = {
  "exact-bytes": "The file is byte-for-byte identical to the registered version.",
  "canonical-text":
    "The text matches the registered version word for word. Formatting, encoding or typography may differ.",
};
