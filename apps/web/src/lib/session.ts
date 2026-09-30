import "server-only";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { getProfileByUserId } from "@/lib/profiles";

/** The current session, or null. Deduplicated per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getCurrentProfile = cache(async (userId: string) => getProfileByUserId(db, userId));

/** Redirects to sign-in (returning to `returnTo` afterwards) when signed out. */
export async function requireSession(returnTo: Route) {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}` as Route);
  return session;
}

/** Also requires an author profile, sending new accounts through onboarding. */
export async function requireAuthor(returnTo: Route) {
  const session = await requireSession(returnTo);
  const profile = await getCurrentProfile(session.user.id);
  if (!profile) redirect("/onboarding");
  return { session, profile };
}
