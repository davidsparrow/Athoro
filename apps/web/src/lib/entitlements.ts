import type { Database } from "@/db/client";

/**
 * Account plans (decision 025). Free keeps core provenance free; Pro sells
 * privacy, packs, domains and convenience, never the ability to check a record.
 */
export type Plan = "free" | "pro";

/** What Pro adds in V0.5. Making a record more public is always free. */
export const PRO_FEATURES = {
  "private-records": "Private, unlisted and embargoed records",
  "domain-verification": "Domain verification",
  "evidence-packs": "Evidence Packs",
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

/**
 * Grants every account Pro, for development and for self-hosted instances
 * without billing. Read on each call so tests can switch it.
 */
export function allAccountsPro(): boolean {
  return process.env.AUTHORO_ALL_PRO === "true";
}

/**
 * The account's current plan. Billing arrives in chunk 10; until then only
 * `AUTHORO_ALL_PRO` grants Pro.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- billing (chunk 10) reads the account's plan
export async function getPlan(db: Database, userId: string): Promise<Plan> {
  return allAccountsPro() ? "pro" : "free";
}
