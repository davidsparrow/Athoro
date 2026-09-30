/**
 * Canonical JSON serialization following RFC 8785 (JSON Canonicalization
 * Scheme): object members sorted by UTF-16 code units, no insignificant
 * whitespace, ECMAScript number and string serialization. Hashing or signing
 * the canonical form makes attestations reproducible by any implementation.
 */

import { formatHash, sha256Hex } from "./fingerprint";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot canonicalize a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  if (typeof value === "object") {
    const withToJson = value as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === "function") return canonicalJson(withToJson.toJSON());
    const members = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`);
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`Cannot canonicalize a value of type ${typeof value}`);
}

/** `sha256:` hash of the canonical JSON form of a value. */
export async function hashCanonicalJson(value: unknown): Promise<string> {
  return formatHash(await sha256Hex(canonicalJson(value)));
}
