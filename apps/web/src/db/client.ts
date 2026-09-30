import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, prepare: false, onnotice: () => {} });
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDatabase>;
