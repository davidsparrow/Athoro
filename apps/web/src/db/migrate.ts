import "dotenv/config";
import { migrationUrl, runMigrations } from "./run-migrations";

/** Applies pending migrations. Usage: pnpm db:migrate [database-url] */
async function main() {
  const url = process.argv[2] ?? migrationUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  await runMigrations(url);
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
