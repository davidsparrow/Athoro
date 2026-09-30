/**
 * Resolves the public origin at build time. An explicit NEXT_PUBLIC_APP_URL
 * wins; on Vercel, production uses the project's production domain and
 * previews use their branch URL, so auth callbacks and proof links work on
 * every deployment without extra configuration.
 */
export function resolveAppUrl(env: Record<string, string | undefined>): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/** Every origin a deployment can be reached at, for auth's CSRF origin checks. */
export function deploymentOrigins(env: Record<string, string | undefined>): string[] {
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean);
  return [resolveAppUrl(env), ...hosts.map((host) => `https://${host}`)].filter(
    (origin, index, all) => all.indexOf(origin) === index,
  );
}
