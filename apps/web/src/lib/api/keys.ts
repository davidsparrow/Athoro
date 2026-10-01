import { formatHash, randomCrockford, sha256Hex } from "@authoro/core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { apiKeys } from "@/db/schema";

export const API_KEY_PREFIX = "au_";
/** 32 Crockford base32 characters: 160 bits of randomness. */
const KEY_BODY_LENGTH = 32;
export const MAX_ACTIVE_KEYS = 10;

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyError";
  }
}

async function hashKey(key: string): Promise<string> {
  return formatHash(await sha256Hex(key));
}

export function looksLikeApiKey(value: string): boolean {
  return new RegExp(`^${API_KEY_PREFIX}[0-9A-HJKMNP-TV-Z]{${KEY_BODY_LENGTH}}$`).test(value);
}

/** Creates a key and returns its plaintext once; only the hash is stored. */
export async function createApiKey(db: Database, userId: string, name: string) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new ApiKeyError("Give the key a name so you can recognise it later.");
  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  if ((active?.count ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new ApiKeyError(`You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  }
  const key = `${API_KEY_PREFIX}${randomCrockford(KEY_BODY_LENGTH)}`;
  const [record] = await db
    .insert(apiKeys)
    .values({
      userId,
      name: cleanName,
      prefix: key.slice(0, API_KEY_PREFIX.length + 6),
      keyHash: await hashKey(key),
    })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });
  return { key, record: record! };
}

/** Resolves an active key to its owner, recording when it was last used. */
export async function authenticateApiKey(db: Database, key: string, now = new Date()) {
  if (!looksLikeApiKey(key)) return null;
  const [record] = await db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(and(eq(apiKeys.keyHash, await hashKey(key)), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, userId: apiKeys.userId, name: apiKeys.name, prefix: apiKeys.prefix });
  return record ?? null;
}

export async function listApiKeys(db: Database, userId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

/** Revokes one of the user's keys. Returns false if it wasn't theirs or was already revoked. */
export async function revokeApiKey(db: Database, userId: string, keyId: string, now = new Date()) {
  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: now })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return revoked.length > 0;
}
