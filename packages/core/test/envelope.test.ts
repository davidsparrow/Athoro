import { describe, expect, it } from "vitest";
import { parseProofEnvelope } from "../src/envelope";

const hash = `sha256:${"0".repeat(64)}`;
const valid = {
  schema: "authoro-proof/1.0",
  issuer: { id: "issuer:writermark", name: "Writermark" },
  work: { title: "Example Article", hash, mediaType: "text/html" },
  author: { displayName: "Jane Smith" },
  timeline: { startedAt: "2026-09-27T10:00:00Z", completedAt: "2026-09-30T08:15:00-07:00" },
  evidence: {
    class: "continuous-observed",
    method: "continuous-composition",
    manualCharacters: 12540,
    pastedCharacters: 922,
    revisionEvents: 481,
    sessions: 6,
  },
};

describe("parseProofEnvelope", () => {
  it("accepts the PRD example and keeps provider-specific evidence", () => {
    const result = parseProofEnvelope(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.evidence.manualCharacters).toBe(12540);
  });

  it("requires only schema, issuer, work hash and evidence method", () => {
    const minimal = {
      schema: "authoro-proof/1.0",
      issuer: valid.issuer,
      work: { hash },
      evidence: { method: "x" },
    };
    expect(parseProofEnvelope(minimal).ok).toBe(true);
  });

  it("reports readable errors", () => {
    const result = parseProofEnvelope({
      ...valid,
      work: { hash: "md5:abc" },
      evidence: { class: "vibes", method: "x" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("work.hash"))).toBe(true);
      expect(result.errors.some((e) => e.startsWith("evidence.class"))).toBe(true);
    }
  });

  it("accepts authoro-proof/1.1 with links to the provider's documentation", () => {
    const result = parseProofEnvelope({
      ...valid,
      schema: "authoro-proof/1.1",
      links: [{ url: "https://writermark.example/r/1", label: "Session report", reportHash: hash }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.links?.[0]?.label).toBe("Session report");
  });

  it("keeps 1.0 envelopes unchanged and refuses links on them", () => {
    const result = parseProofEnvelope(valid);
    expect(result.ok && "links" in result.envelope).toBe(false);
    const withLinks = parseProofEnvelope({ ...valid, links: [{ url: "https://writermark.example/r/1" }] });
    expect(withLinks).toEqual({ ok: false, errors: ["links: Links need schema authoro-proof/1.1."] });
  });

  it("validates links", () => {
    const result = parseProofEnvelope({
      ...valid,
      schema: "authoro-proof/1.1",
      links: [{ url: "http://writermark.example/r/1" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^links\.0\.url: /);
  });

  it("rejects invalid JSON, wrong schema versions and oversized input", () => {
    expect(parseProofEnvelope("{nope").ok).toBe(false);
    expect(parseProofEnvelope({ ...valid, schema: "authoro-proof/9.9" }).ok).toBe(false);
    expect(parseProofEnvelope(JSON.stringify({ ...valid, pad: "x".repeat(70_000) })).ok).toBe(false);
  });
});
