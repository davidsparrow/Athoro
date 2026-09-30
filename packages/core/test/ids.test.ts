import { describe, expect, it } from "vitest";
import {
  CROCKFORD_ALPHABET,
  generateProofId,
  generateWorkId,
  isProofId,
  isWorkId,
  parseProofId,
  parseWorkId,
} from "../src/ids";

describe("proof IDs", () => {
  it("generates AU- plus six Crockford base32 characters", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateProofId();
      expect(id).toMatch(/^AU-[0-9A-HJKMNP-TV-Z]{6}$/);
      expect(isProofId(id)).toBe(true);
    }
  });

  it("uses every alphabet character and nothing else", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const ch of generateProofId().slice(3)) seen.add(ch);
    expect([...seen].sort().join("")).toBe(CROCKFORD_ALPHABET);
  });

  it("parses forgiving input", () => {
    expect(parseProofId("AU-7K3F92")).toBe("AU-7K3F92");
    expect(parseProofId("  au-7k3f92 ")).toBe("AU-7K3F92");
    expect(parseProofId("au7k3f92")).toBe("AU-7K3F92");
    expect(parseProofId("AU-7K3FO2")).toBe("AU-7K3F02");
    expect(parseProofId("AU-IL3F92")).toBe("AU-113F92");
    expect(parseProofId("https://authoro.net/p/AU-7K3F92?ref=mark")).toBe("AU-7K3F92");
    expect(parseProofId("authoro.net/p/au-7k3f92/")).toBe("AU-7K3F92");
  });

  it("rejects malformed input", () => {
    expect(parseProofId("")).toBeNull();
    expect(parseProofId("AU-7K3F")).toBeNull();
    expect(parseProofId("AU-7K3F9U")).toBeNull();
    expect(parseProofId("XY-7K3F92")).toBeNull();
    expect(parseProofId("AUW-4F8Q2M9C")).toBeNull();
    expect(parseProofId("AU-7K3F92-extra")).toBeNull();
    expect(isProofId("au-7k3f92")).toBe(false);
  });
});

describe("work IDs", () => {
  it("generates and parses AUW- IDs", () => {
    const id = generateWorkId();
    expect(id).toMatch(/^AUW-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(isWorkId(id)).toBe(true);
    expect(parseWorkId("auw-4f8q2m9c")).toBe("AUW-4F8Q2M9C");
    expect(parseWorkId("AU-7K3F92")).toBeNull();
  });
});
