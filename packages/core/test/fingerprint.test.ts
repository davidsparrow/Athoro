import { describe, expect, it } from "vitest";
import {
  abbreviateHash,
  canonicalizeText,
  fingerprintDocument,
  fingerprintPastedText,
  fingerprintText,
  htmlToText,
  inferMediaType,
  isTextMediaType,
  parseHash,
  sha256Hex,
} from "../src/fingerprint";

const encode = (text: string) => new TextEncoder().encode(text);

describe("sha256Hex", () => {
  it("matches known test vectors", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex(encode("abc"))).toBe(await sha256Hex("abc"));
  });
});

describe("hash strings", () => {
  const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  it("parses prefixed and bare digests", () => {
    expect(parseHash(`sha256:${digest}`)).toBe(`sha256:${digest}`);
    expect(parseHash(digest.toUpperCase())).toBe(`sha256:${digest}`);
    expect(parseHash("sha256:abc")).toBeNull();
    expect(parseHash(`md5:${digest}`)).toBeNull();
  });

  it("abbreviates for display", () => {
    expect(abbreviateHash(`sha256:${digest}`)).toBe("sha256:ba7816\u202615ad");
  });
});

describe("canonicalizeText (authoro-text/1)", () => {
  it("ignores whitespace and line-ending differences", () => {
    expect(canonicalizeText("  Hello,\r\n\r\n  world!\t ")).toBe("Hello, world!");
    expect(canonicalizeText("One\n\nTwo")).toBe(canonicalizeText("One Two"));
  });

  it("folds typography that editors change automatically", () => {
    expect(canonicalizeText("\u201CIt\u2019s fine,\u201D she said\u2026")).toBe('"It\'s fine," she said...');
    expect(canonicalizeText("a -- b --- c \u2013 d \u2014 e")).toBe("a - b - c - d - e");
    expect(canonicalizeText("non\u00A0breaking")).toBe("non breaking");
    expect(canonicalizeText("\uFB01nd")).toBe("find");
  });

  it("removes invisible formatting characters", () => {
    expect(canonicalizeText("\uFEFFsoft\u00ADhyphen zero\u200Bwidth")).toBe("softhyphen zerowidth");
  });

  it("preserves case and punctuation", () => {
    expect(canonicalizeText("Hello World.")).not.toBe(canonicalizeText("hello world."));
    expect(canonicalizeText("Hello World.")).not.toBe(canonicalizeText("Hello World"));
  });
});

describe("htmlToText", () => {
  it("extracts visible text", () => {
    const html = `<!doctype html><html><head><title>Hidden title</title><style>p{}</style></head>
      <body><!-- note --><h1>The Future</h1><p>Of <b>inde</b>pendent&nbsp;software &amp; more.</p>
      <script>alert("x > y")</script><p data-x="a>b">Second</p></body></html>`;
    expect(canonicalizeText(htmlToText(html))).toBe("The Future Of independent software & more. Second");
  });

  it("drops XML declarations from XHTML", () => {
    expect(canonicalizeText(htmlToText('<?xml version="1.0"?><html><body><p>Hi</p></body></html>'))).toBe(
      "Hi",
    );
  });

  it("keeps escaped markup as text", () => {
    expect(canonicalizeText(htmlToText("<p>Use &lt;b&gt; for bold</p>"))).toBe("Use <b> for bold");
  });

  it("does not treat <header> as <head>", () => {
    expect(canonicalizeText(htmlToText("<header>Visible</header>"))).toBe("Visible");
  });
});

describe("fingerprintDocument", () => {
  it("matches a pasted copy of an HTML document by canonical text", async () => {
    const html = await fingerprintDocument({
      bytes: encode("<article><h1>Title</h1><p>\u201CQuoted\u201D text&mdash;here.</p></article>"),
      mediaType: "text/html",
    });
    const pasted = await fingerprintPastedText('Title\n\n"Quoted" text--here.');
    expect(html.textHash).toBeDefined();
    expect(pasted.textHash).toBe(html.textHash);
    expect(pasted.contentHash).not.toBe(html.contentHash);
  });

  it("only hashes bytes for binary media types", async () => {
    const fp = await fingerprintDocument({ bytes: new Uint8Array([1, 2, 3]), mediaType: "application/pdf" });
    expect(fp.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fp.textHash).toBeUndefined();
    expect(fp.byteLength).toBe(3);
  });

  it("skips the text hash when a text file is not valid UTF-8", async () => {
    const fp = await fingerprintDocument({
      bytes: new Uint8Array([0xff, 0xfe, 0x00]),
      mediaType: "text/plain",
    });
    expect(fp.textHash).toBeUndefined();
  });

  it("ignores a UTF-8 byte order mark in the text hash", async () => {
    const withBom = await fingerprintDocument({ bytes: encode("\uFEFFHello"), mediaType: "text/plain" });
    const without = await fingerprintDocument({ bytes: encode("Hello"), mediaType: "text/plain" });
    expect(withBom.textHash).toBe(without.textHash);
    expect(withBom.contentHash).not.toBe(without.contentHash);
  });
});

describe("fingerprintText", () => {
  it("counts words and characters of the canonical text", async () => {
    const fp = await fingerprintText("  Two  words\n");
    expect(fp.wordCount).toBe(2);
    expect(fp.characterCount).toBe(9);
    expect((await fingerprintText("   ")).wordCount).toBe(0);
  });
});

describe("media types", () => {
  it("infers from extension when the browser reports nothing", () => {
    expect(inferMediaType("essay.md", "")).toBe("text/markdown");
    expect(inferMediaType("Essay.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(inferMediaType("x.unknown")).toBe("application/octet-stream");
    expect(inferMediaType("page.html", "text/html; charset=utf-8")).toBe("text/html");
  });

  it("classifies text media types", () => {
    expect(isTextMediaType("text/markdown")).toBe(true);
    expect(isTextMediaType("application/json")).toBe(true);
    expect(isTextMediaType("application/pdf")).toBe(false);
  });
});

describe("canonicalizeText edge cases", () => {
  it("folds primes to apostrophes after NFKC", () => {
    expect(canonicalizeText("5\u2032 11\u2033")).toBe("5' 11''");
  });
});
