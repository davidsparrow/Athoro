import type { Route } from "next";

/**
 * Accepts only same-site relative paths, so `?next=` parameters can't be used
 * as an open redirect.
 */
export function safeNextPath(
  value: string | string[] | null | undefined,
  fallback: Route = "/dashboard",
): Route {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  return candidate as Route;
}
