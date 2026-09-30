import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Rebuilds the test database from migrations once per run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL is not set; database integration tests will be skipped.");
    return;
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`DROP SCHEMA IF EXISTS public CASCADE`;
    await client`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    await client`CREATE SCHEMA public`;
    await migrate(drizzle({ client }), {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    });
  } finally {
    await client.end();
  }
}
