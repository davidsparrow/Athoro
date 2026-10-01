/**
 * Documentation links.
 *
 * Whoever submits evidence may point readers at their own documentation or
 * audit trail for a work: the author in their creation disclosure, a platform
 * or school in its Proof Envelope. A link lives inside the hashed (and, from
 * V1, signed) evidence, so it can't be swapped after submission. It may carry
 * the SHA-256 of an exported report, so a reader can check that a copy they
 * downloaded is the one the submitter described.
 *
 * Authoro never fetches, stores or monitors linked documentation. Links are
 * shown as "Documentation hosted by <host>", attributed to their submitter.
 */

import { z } from "zod";
import { hashStringSchema } from "./hash-schema";

export const MAX_LINKS = 5;
export const MAX_LINK_URL_LENGTH = 2000;
export const MAX_LINK_LABEL_LENGTH = 80;

/**
 * A public DNS name: dot-separated labels ending in an alphabetic or punycode
 * top-level label. IP literals and single-label hosts such as `localhost`
 * don't qualify. `URL` has already lowercased and punycoded the hostname.
 */
const PUBLIC_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Control and bidirectional formatting characters, which can disguise what text says. */
function hasHiddenCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return true;
    if (code === 0x061c || code === 0x200e || code === 0x200f) return true;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return true;
  }
  return false;
}

/**
 * Parses a documentation URL: `https://` only, a public domain, no embedded
 * credentials, whitespace or hidden characters. Returns null otherwise.
 */
export function parseDocumentationUrl(value: string): URL | null {
  if (value.length > MAX_LINK_URL_LENGTH || !/^https:\/\//i.test(value)) return null;
  if (/\s/.test(value) || hasHiddenCharacters(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return PUBLIC_HOSTNAME.test(url.hostname) ? url : null;
}

/**
 * The host a link points to, as readers see it: "Documentation hosted by
 * <host>". A leading `www.` is dropped; internationalized names stay in
 * punycode so look-alike characters can't impersonate another domain.
 */
export function linkHost(url: string): string {
  const hostname = parseDocumentationUrl(url)?.hostname ?? "";
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export const documentationLinkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(MAX_LINK_URL_LENGTH, `Links can be at most ${MAX_LINK_URL_LENGTH} characters.`)
    .refine(
      (value) => parseDocumentationUrl(value) !== null,
      "Use a full https:// address on a public domain, e.g. https://example.com/report.",
    ),
  /** A short description from the submitter, e.g. "Session report". */
  label: z
    .string()
    .trim()
    .min(1, "Leave the label out rather than empty.")
    .max(MAX_LINK_LABEL_LENGTH, `Labels can be at most ${MAX_LINK_LABEL_LENGTH} characters.`)
    .refine((value) => !hasHiddenCharacters(value), "Labels can't contain control characters.")
    .optional(),
  /** SHA-256 of an exported report, so readers can check a downloaded copy. */
  reportHash: hashStringSchema.optional(),
});

export type DocumentationLink = z.infer<typeof documentationLinkSchema>;

export const documentationLinksSchema = z
  .array(documentationLinkSchema)
  .max(MAX_LINKS, `Add at most ${MAX_LINKS} links.`)
  .superRefine((links, ctx) => {
    const seen = new Set<string>();
    links.forEach((link, index) => {
      const href = parseDocumentationUrl(link.url)?.href;
      if (!href) return;
      if (seen.has(href)) {
        ctx.addIssue({ code: "custom", path: [index, "url"], message: "Each link may be added once." });
      }
      seen.add(href);
    });
  });

/** Documentation the author links to after registration. Displayed as "Author supplied". */
export const DOCUMENTATION_SCHEMA = "authoro-documentation/1.0";

export const documentationSchema = z.object({
  links: documentationLinksSchema.min(1, "Add at least one link."),
});

export type Documentation = z.infer<typeof documentationSchema>;
