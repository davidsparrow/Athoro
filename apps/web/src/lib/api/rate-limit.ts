import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { apiRateLimits } from "@/db/schema";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  resetSeconds: number;
}

/** Fixed-window counter in Postgres, so limits hold across serverless instances. */
export async function consumeRateLimit(
  db: Database,
  key: string,
  { limit, windowSeconds }: RateLimitRule,
  now = Date.now(),
): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(now / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);
  const [row] = await db
    .insert(apiRateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        count: sql`CASE WHEN ${apiRateLimits.windowStart} = ${windowStart} THEN ${apiRateLimits.count} + 1 ELSE 1 END`,
        windowStart,
      },
    })
    .returning({ count: apiRateLimits.count });
  const count = row?.count ?? 1;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetSeconds: windowStart + windowSeconds - nowSeconds,
  };
}
