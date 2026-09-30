import { z } from "zod";

/** Handles are public URLs (/a/<handle>), so paths and brand terms are reserved. */
export const RESERVED_HANDLES = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "api",
  "app",
  "auth",
  "authoro",
  "billing",
  "blog",
  "contact",
  "dashboard",
  "docs",
  "edit",
  "help",
  "issuer",
  "issuers",
  "legal",
  "login",
  "logout",
  "mail",
  "moderator",
  "new",
  "null",
  "official",
  "onboarding",
  "press",
  "pricing",
  "privacy",
  "publisher",
  "publishers",
  "register",
  "root",
  "security",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signout",
  "signup",
  "staff",
  "status",
  "support",
  "system",
  "team",
  "terms",
  "undefined",
  "verify",
  "verified",
  "www",
]);

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 40;
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export const handleSchema = z
  .string()
  .transform(normalizeHandle)
  .pipe(
    z
      .string()
      .min(HANDLE_MIN, `Handles need at least ${HANDLE_MIN} characters.`)
      .max(HANDLE_MAX, `Handles can be at most ${HANDLE_MAX} characters.`)
      .regex(
        HANDLE_PATTERN,
        "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.",
      )
      .refine((handle) => !handle.includes("--"), "Use single hyphens only.")
      .refine((handle) => !RESERVED_HANDLES.has(handle), "That handle is reserved."),
  );

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((value) => value || null);

export const profileFieldsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter the name you publish under.")
    .max(80, "Display names can be at most 80 characters."),
  bio: optionalText(500, "Bio"),
  websiteUrl: z
    .string()
    .trim()
    .max(200, "Website URLs can be at most 200 characters.")
    .refine(
      (value) => value === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value),
      "Enter a full URL starting with https://",
    )
    .transform((value) => value || null),
  isPublic: z.boolean(),
});

export const createProfileSchema = profileFieldsSchema.extend({ handle: handleSchema });

export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/** Reads profile fields from a submitted form. Checkbox absent means false. */
export function profileFormValues(formData: FormData) {
  return {
    handle: String(formData.get("handle") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    isPublic: formData.get("isPublic") === "on",
  };
}

/** First error message per field, for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Suggests a handle from a display name, e.g. "Zoë Adèle" -> "zoe-adele". */
export function suggestHandle(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, "");
  return slug.length >= HANDLE_MIN ? slug : "";
}
