import { describe, expect, it } from "vitest";
import { compareFingerprints } from "../src/verify";

const a = `sha256:${"a".repeat(64)}`;
const b = `sha256:${"b".repeat(64)}`;
const c = `sha256:${"c".repeat(64)}`;

describe("compareFingerprints", () => {
  it("prefers an exact byte match", () => {
    expect(compareFingerprints({ contentHash: a, textHash: b }, { contentHash: a, textHash: b })).toEqual({
      matched: true,
      method: "exact-bytes",
    });
  });

  it("falls back to canonical text", () => {
    expect(compareFingerprints({ contentHash: a, textHash: b }, { contentHash: c, textHash: b })).toEqual({
      matched: true,
      method: "canonical-text",
    });
  });

  it("does not match when the registered version has no text hash", () => {
    expect(compareFingerprints({ contentHash: a, textHash: null }, { textHash: b }).matched).toBe(false);
    expect(compareFingerprints({ contentHash: a }, {}).matched).toBe(false);
  });
});
