import { describe, expect, it } from "vitest";
import {
  documentationLinksSchema,
  documentationSchema,
  linkHost,
  MAX_LINKS,
  parseDocumentationUrl,
} from "../src/links";

const hash = `sha256:${"a".repeat(64)}`;

describe("parseDocumentationUrl", () => {
  it("accepts https addresses on public domains", () => {
    for (const url of [
      "https://writermark.example/reports/7K3F92",
      "https://docs.google.com/document/d/abc/edit?usp=sharing#heading=h.1",
      "https://example.co.uk:8443/a%20b",
      "HTTPS://Example.COM/Report",
    ]) {
      expect(parseDocumentationUrl(url), url).not.toBeNull();
    }
  });

  it("rejects other schemes, hosts without a public domain, credentials and hidden characters", () => {
    for (const url of [
      "http://example.com/report",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https:example.com",
      "//example.com/report",
      "https://localhost/report",
      "https://127.0.0.1/report",
      "https://[::1]/report",
      "https://intranet/report",
      "https://example.com./report",
      "https://authoro.net@evil.example/report",
      "https://user:pass@example.com/",
      "https://example.com/a b",
      `https://example.com/${String.fromCodePoint(0x202e)}fdp.exe`,
      `https://example.com/${String.fromCodePoint(0x7)}`,
      `https://example.com/${"a".repeat(2000)}`,
    ]) {
      expect(parseDocumentationUrl(url), url).toBeNull();
    }
  });

  it("keeps internationalized hosts in punycode", () => {
    expect(parseDocumentationUrl("https://bücher.example/")?.hostname).toBe("xn--bcher-kva.example");
  });
});

describe("linkHost", () => {
  it("names the host readers will land on", () => {
    expect(linkHost("https://www.writermark.example/r/1")).toBe("writermark.example");
    expect(linkHost("https://reports.school.example/r/1")).toBe("reports.school.example");
    expect(linkHost("https://аpple.example/")).toBe("xn--pple-43d.example");
    expect(linkHost("not a url")).toBe("");
  });
});

describe("documentationLinksSchema", () => {
  it("accepts a link with a label and a report hash", () => {
    const result = documentationLinksSchema.safeParse([
      { url: " https://writermark.example/r/1 ", label: " Session report ", reportHash: hash },
    ]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { url: "https://writermark.example/r/1", label: "Session report", reportHash: hash },
    ]);
  });

  it("limits the number of links and rejects duplicates", () => {
    const links = Array.from({ length: MAX_LINKS + 1 }, (_, i) => ({ url: `https://example.com/${i}` }));
    expect(documentationLinksSchema.safeParse(links).success).toBe(false);
    const duplicate = documentationLinksSchema.safeParse([
      { url: "https://example.com/report" },
      { url: "https://EXAMPLE.com/report" },
    ]);
    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.issues[0]?.path).toEqual([1, "url"]);
  });

  it("rejects bad labels and report hashes", () => {
    const url = "https://example.com/report";
    expect(documentationLinksSchema.safeParse([{ url, label: "" }]).success).toBe(false);
    expect(documentationLinksSchema.safeParse([{ url, label: "x".repeat(81) }]).success).toBe(false);
    expect(
      documentationLinksSchema.safeParse([{ url, label: `Report${String.fromCodePoint(0x202e)}` }]).success,
    ).toBe(false);
    expect(documentationLinksSchema.safeParse([{ url, reportHash: "md5:abc" }]).success).toBe(false);
  });
});

describe("documentationSchema", () => {
  it("needs at least one link", () => {
    expect(documentationSchema.safeParse({ links: [] }).success).toBe(false);
    expect(documentationSchema.safeParse({ links: [{ url: "https://example.com/" }] }).success).toBe(true);
  });
});
