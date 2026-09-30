"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  createProfileSchema,
  fieldErrors,
  handleSchema,
  profileFieldsSchema,
  profileFormValues,
} from "@/lib/profile-validation";
import { createAuthorProfile, isHandleAvailable, ProfileError, updateAuthorProfile } from "@/lib/profiles";
import { getSession, requireAuthor, requireSession } from "@/lib/session";

export interface ProfileFormState {
  errors?: Record<string, string>;
  saved?: boolean;
  values?: ReturnType<typeof profileFormValues>;
}

export async function createProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await requireSession("/onboarding");
  const values = profileFormValues(formData);
  const parsed = createProfileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    const profile = await createAuthorProfile(db, session.user.id, parsed.data);
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "profile.created",
      targetType: "author_profile",
      targetId: profile.id,
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof ProfileError) return { errors: { [error.field]: error.message }, values };
    throw error;
  }
  redirect("/dashboard");
}

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { session, profile } = await requireAuthor("/settings");
  const values = { ...profileFormValues(formData), handle: profile.handle };
  const parsed = profileFieldsSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  await updateAuthorProfile(db, session.user.id, parsed.data);
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "profile.updated",
    targetType: "author_profile",
    targetId: profile.id,
    headers: await headers(),
  });
  revalidatePath("/", "layout");
  return { saved: true, values };
}

export async function checkHandleAction(input: string): Promise<{ available: boolean; message: string }> {
  if (!(await getSession())) return { available: false, message: "" };
  const parsed = handleSchema.safeParse(input);
  if (!parsed.success)
    return { available: false, message: parsed.error.issues[0]?.message ?? "Invalid handle." };
  return (await isHandleAvailable(db, parsed.data))
    ? { available: true, message: `authoro.net/a/${parsed.data} is available.` }
    : { available: false, message: "That handle is taken." };
}

export interface SetPasswordState {
  error?: string;
  saved?: boolean;
}

const newPasswordSchema = z.string().min(10, "Use at least 10 characters.").max(128);

/** For accounts created with email links, which have no password yet. */
export async function setPasswordAction(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const session = await requireSession("/settings");
  const parsed = newPasswordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data !== formData.get("confirm")) return { error: "The passwords don't match." };

  const requestHeaders = await headers();
  try {
    await auth.api.setPassword({ body: { newPassword: parsed.data }, headers: requestHeaders });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't set your password." };
  }
  await recordAudit({
    actorType: "user",
    actorId: session.user.id,
    action: "auth.password_set",
    headers: requestHeaders,
  });
  revalidatePath("/settings");
  return { saved: true };
}

/** Signing out in a server action clears the cookie and the client router cache together. */
export async function signOutAction() {
  const requestHeaders = await headers();
  const session = await getSession();
  await auth.api.signOut({ headers: requestHeaders });
  if (session) {
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "auth.signed_out",
      headers: requestHeaders,
    });
  }
  redirect("/");
}
