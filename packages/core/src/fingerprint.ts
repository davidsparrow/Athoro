/**
 * Document fingerprints.
 *
 * Every registered version carries up to two SHA-256 fingerprints:
 *
 * - `contentHash`: the exact bytes of the file. Proves byte-for-byte identity.
 * - `textHash`: the document's text after `authoro-text/1` canonicalization.
 *   Survives re-encoding, copy/paste from a browser, smart quotes, and
 *   whitespace or line-ending changes, so a reader can paste published text
 *   and still check it against the registered version.
 *
 * Hashing uses Web Crypto, so the same code runs in browsers and Node. Authors
 * can fingerprint locally without their document ever leaving the device.
 */

import { decodeHTML } from "entities";

export const HASH_ALGORITHM = "sha256";
export const TEXT_CANONICALIZATION = "authoro-text/1";

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return toHex(new Uint8Array(digest));
}

/** Formats a hex digest as an Authoro hash string, e.g. `sha256:ba78…`. */
export function formatHash(hexDigest: string): string {
  return `${HASH_ALGORITHM}:${hexDigest.toLowerCase()}`;
}

/** Accepts `sha256:<hex>` or a bare 64-character hex digest; returns the canonical form or null. */
export function parseHash(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const candidate = trimmed.includes(":") ? trimmed : `${HASH_ALGORITHM}:${trimmed}`;
  return HASH_PATTERN.test(candidate) ? candidate : null;
}

export function isHash(value: string): boolean {
  return HASH_PATTERN.test(value);
}

/** Shortened form for display, e.g. `sha256:93ab8e…c41f`. */
export function abbreviateHash(hash: string, head = 6, tail = 4): string {
  const [algorithm, digest = ""] = hash.split(":");
  if (digest.length <= head + tail) return hash;
  return `${algorithm}:${digest.slice(0, head)}…${digest.slice(-tail)}`;
}

// Invisible formatting characters that editors and CMSs insert or strip freely:
// soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM.
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/g;
// U+2033 (double prime) needs no entry: NFKC has already split it into two primes.
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F]/g;
// Hyphen-minus runs and every Unicode dash collapse to one hyphen, so `--`,
// `---`, en dash and em dash (which editors auto-convert between) all agree.
const DASHES = /[-\u2010-\u2015\u2212]+/g;

/**
 * `authoro-text/1` canonicalization. Keeps the words and their order; drops
 * typography and layout. Steps, in order:
 *
 * 1. Unicode NFKC (folds ligatures, full-width forms, NBSP, `…` → `...`).
 * 2. Remove invisible formatting characters.
 * 3. Curly single/double quotes and primes → `'` / `"`.
 * 4. Runs of hyphens and dashes → a single `-`.
 * 5. Collapse every whitespace run (including line breaks) to one space; trim.
 */
export function canonicalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS, "")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "body", "br", "caption", "dd", "details",
  "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "li", "main",
  "nav", "ol", "option", "p", "pre", "section", "summary", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul",
]);

// A tag, allowing `>` inside quoted attribute values.
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/**
 * Extracts the reader-visible text of an HTML document, approximating what a
 * browser copies: drops `<head>`, scripts, styles, comments and markup, breaks
 * words at block elements, and decodes character references.
 */
export function htmlToText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>|<\?[\s\S]*?\?>/g, "") // doctype, XML declaration
    .replace(/<head[\s>][\s\S]*?<\/head\s*>/gi, " ")
    .replace(/<(script|style|template|noscript)[\s>][\s\S]*?<\/\1\s*>/gi, " ");
  const withoutTags = withoutHidden.replace(TAG, (_tag, name: string) =>
    BLOCK_ELEMENTS.has(name.toLowerCase()) ? " " : "",
  );
  return decodeHTML(withoutTags);
}

const TEXT_MEDIA_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/x-markdown",
]);

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
  rtf: "application/rtf",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  epub: "application/epub+zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  zip: "application/zip",
};

/** Best-effort media type from a file name, for when the browser reports none. */
export function inferMediaType(fileName: string, reported?: string | null): string {
  const cleanReported = reported?.split(";")[0]?.trim().toLowerCase();
  if (cleanReported) return cleanReported;
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MEDIA_TYPES[extension] ?? "application/octet-stream";
}

export function isTextMediaType(mediaType: string): boolean {
  const type = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type.startsWith("text/") || TEXT_MEDIA_TYPES.has(type);
}

function isHtmlMediaType(mediaType: string): boolean {
  const type = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "text/html" || type === "application/xhtml+xml";
}

export interface TextFingerprint {
  /** `sha256:` hash of the UTF-8 bytes of the canonical text. */
  textHash: string;
  /** Characters in the canonical text (Unicode code points). */
  characterCount: number;
  /** Space-separated tokens in the canonical text. Approximate for unspaced scripts. */
  wordCount: number;
}

export interface DocumentFingerprint extends Partial<TextFingerprint> {
  /** `sha256:` hash of the exact bytes. */
  contentHash: string;
  mediaType: string;
  byteLength: number;
}

export async function fingerprintText(text: string): Promise<TextFingerprint> {
  const canonical = canonicalizeText(text);
  return {
    textHash: formatHash(await sha256Hex(canonical)),
    characterCount: [...canonical].length,
    wordCount: canonical === "" ? 0 : canonical.split(" ").length,
  };
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Fingerprints a file. Text-based media types (plain text, Markdown, HTML, …)
 * that decode as UTF-8 also get a `textHash`; HTML is reduced to its visible
 * text first. Binary formats (PDF, DOCX, images) get a `contentHash` only.
 */
export async function fingerprintDocument(input: {
  bytes: Uint8Array;
  mediaType: string;
}): Promise<DocumentFingerprint> {
  const { bytes, mediaType } = input;
  const base: DocumentFingerprint = {
    contentHash: formatHash(await sha256Hex(bytes)),
    mediaType,
    byteLength: bytes.byteLength,
  };
  if (!isTextMediaType(mediaType)) return base;
  const decoded = decodeUtf8(bytes);
  if (decoded === null) return base;
  const text = isHtmlMediaType(mediaType) ? htmlToText(decoded) : decoded;
  return { ...base, ...(await fingerprintText(text)) };
}

/** Fingerprints text typed or pasted directly (registered as `text/plain`). */
export async function fingerprintPastedText(text: string): Promise<DocumentFingerprint> {
  const bytes = new TextEncoder().encode(text);
  return {
    contentHash: formatHash(await sha256Hex(bytes)),
    mediaType: "text/plain",
    byteLength: bytes.byteLength,
    ...(await fingerprintText(text)),
  };
}
