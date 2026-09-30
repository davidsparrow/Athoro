import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDatabase(url: string, options: { max?: number } = {}) {
  // prepare: false keeps it compatible with transaction-mode poolers (Neon, Supabase, PgBouncer);
  // idle_timeout releases connections from serverless instances that go quiet.
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDatabase>;
