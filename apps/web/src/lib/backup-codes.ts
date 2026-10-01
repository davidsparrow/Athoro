import { randomCrockford } from "@authoro/core";

export const BACKUP_CODE_COUNT = 10;

/**
 * Backup codes people can read aloud and type: two groups of five Crockford
 * base32 characters (upper case, no I, L, O or U), 50 random bits each, like
 * `7K3F9-2MXQ4`. Each works once.
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => `${randomCrockford(5)}-${randomCrockford(5)}`);
}

/** Forgives case, spacing, a missing hyphen and the O/0, I/L/1 look-alikes. */
export function normalizeBackupCode(input: string): string {
  const body = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return body.length === 10 ? `${body.slice(0, 5)}-${body.slice(5)}` : input.trim();
}
