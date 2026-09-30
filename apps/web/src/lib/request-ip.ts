import { toHex } from "@authoro/core";

/** The client IP as reported by the platform's proxy headers, or null. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

let ipKey: Promise<CryptoKey> | undefined;

/**
 * Keyed hash of a client IP, so requests can be correlated and rate limited
 * without storing addresses. The key is derived from the server secret.
 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  ipKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`authoro-audit-ip:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", await ipKey, new TextEncoder().encode(ip));
  return toHex(new Uint8Array(signature));
}
