import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applies pending migrations from ./drizzle over a single direct connection. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
    });
  } finally {
    await client.end();
  }
}

/** Migrations take locks and run DDL, so prefer a direct (unpooled) connection when one is provided. */
export function migrationUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
}
