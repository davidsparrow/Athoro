import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiKeyError,
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  looksLikeApiKey,
  MAX_ACTIVE_KEYS,
  revokeApiKey,
} from "@/lib/api/keys";
import { consumeRateLimit } from "@/lib/api/rate-limit";
import { createAuthor, testDatabase } from "./helpers";

const db = testDatabase();

describe.skipIf(!db)("API keys", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user", api_rate_limits CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  it("creates a key shown once, stores only its hash, and authenticates it", async () => {
    const { userId } = await createAuthor(d);
    const { key, record } = await createApiKey(d, userId, "  Blog plugin ");
    expect(looksLikeApiKey(key)).toBe(true);
    expect(record).toMatchObject({ name: "Blog plugin", prefix: key.slice(0, 9) });
    const stored = await d.execute(sql`select key_hash from api_keys`);
    expect(JSON.stringify(stored)).not.toContain(key);

    const now = new Date("2026-10-01T00:00:00Z");
    expect(await authenticateApiKey(d, key, now)).toMatchObject({ userId, id: record.id });
    expect((await listApiKeys(d, userId))[0]?.lastUsedAt).toEqual(now);
    expect(await authenticateApiKey(d, `${key.slice(0, -1)}0`)).toBeNull();
    expect(await authenticateApiKey(d, "not-a-key")).toBeNull();
  });

  it("revokes keys for their owner only", async () => {
    const owner = await createAuthor(d);
    const other = await createAuthor(d, "other");
    const { key, record } = await createApiKey(d, owner.userId, "Key");
    expect(await revokeApiKey(d, other.userId, record.id)).toBe(false);
    expect(await revokeApiKey(d, owner.userId, record.id)).toBe(true);
    expect(await revokeApiKey(d, owner.userId, record.id)).toBe(false);
    expect(await authenticateApiKey(d, key)).toBeNull();
  });

  it("caps active keys and requires a name", async () => {
    const { userId } = await createAuthor(d);
    await expect(createApiKey(d, userId, "  ")).rejects.toBeInstanceOf(ApiKeyError);
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) await createApiKey(d, userId, `Key ${i}`);
    await expect(createApiKey(d, userId, "One too many")).rejects.toThrow(/at most/);
  });

  it("counts requests per fixed window", async () => {
    const rule = { limit: 2, windowSeconds: 60 };
    const t0 = Date.UTC(2026, 9, 1, 0, 0, 10);
    expect(await consumeRateLimit(d, "k", rule, t0)).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetSeconds: 50,
    });
    expect((await consumeRateLimit(d, "k", rule, t0 + 1000)).allowed).toBe(true);
    expect(await consumeRateLimit(d, "k", rule, t0 + 2000)).toMatchObject({ allowed: false, remaining: 0 });
    expect((await consumeRateLimit(d, "other", rule, t0 + 2000)).allowed).toBe(true);
    expect(await consumeRateLimit(d, "k", rule, t0 + 60_000)).toMatchObject({ allowed: true, remaining: 1 });
  });
});
