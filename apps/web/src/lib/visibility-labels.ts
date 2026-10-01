/**
 * Record visibility and evidence presets in words, safe to import from client
 * components (no database code). See `visibility.ts` for the rules.
 */

export type Visibility = "public" | "unlisted" | "private";
export type EvidencePreset = "minimal" | "standard" | "detailed";

export const VISIBILITIES: Record<Visibility, { label: string; description: string }> = {
  public: {
    label: "Public",
    description: "Anyone can look it up, and it's listed on your author page.",
  },
  unlisted: {
    label: "Unlisted",
    description: "Anyone with the link or ID can see it. It isn't listed or indexed by search engines.",
  },
  private: {
    label: "Private",
    description: "Only you see the details. Visitors see that a record exists, and nothing else.",
  },
};

/** Evidence presets (PRD §8). Minimal hides content, not verifiability. */
export const EVIDENCE_PRESETS: Record<EvidencePreset, { label: string; description: string }> = {
  minimal: {
    label: "Minimal",
    description:
      "Who supplied each piece of evidence, its links, hashes and status. Your note, AI uses and tools, and the details inside Proof Envelopes are hidden, on the record and in the API.",
  },
  standard: {
    label: "Standard",
    description: "Adds your note, AI uses and tools, and each Proof Envelope's main details.",
  },
  detailed: {
    label: "Detailed",
    description: "Adds every field each Proof Envelope carries, including nested statistics.",
  },
};

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && Object.hasOwn(VISIBILITIES, value);
}

export function isEvidencePreset(value: unknown): value is EvidencePreset {
  return typeof value === "string" && Object.hasOwn(EVIDENCE_PRESETS, value);
}
