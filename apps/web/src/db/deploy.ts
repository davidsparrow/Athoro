import { migrationUrl, runMigrations } from "./run-migrations";

/**
 * Vercel build step, run before `next build`. Production deployments always
 * migrate. Preview deployments migrate only with AUTHORO_MIGRATE_PREVIEWS=true,
 * which is safe when each preview gets its own database branch (for example
 * Neon's Vercel integration); otherwise a preview could change the schema of
 * a database that production also uses.
 */
async function main() {
  const environment = process.env.VERCEL_ENV;
  const migrate = environment === "production" || process.env.AUTHORO_MIGRATE_PREVIEWS === "true";
  if (!migrate) {
    console.log(`Skipping database migrations for the ${environment ?? "local"} build.`);
    return;
  }
  const url = migrationUrl();
  if (!url) throw new Error("DATABASE_URL is not set; cannot migrate before deploying.");
  await runMigrations(url);
  console.log(`Database migrations applied for the ${environment} deployment.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
