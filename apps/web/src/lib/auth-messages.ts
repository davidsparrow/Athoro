const MESSAGES: Record<string, string | null> = {
  INVALID_CODE: "That code didn't work. Check your authenticator app and try again.",
  INVALID_BACKUP_CODE: "That backup code didn't work. Each code works once.",
  INVALID_TWO_FACTOR_COOKIE: "This sign-in has expired. Start again.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many wrong codes. Start signing in again.",
  ACCOUNT_TEMPORARILY_LOCKED: "Too many wrong codes. For your security, try again in 15 minutes.",
  INVALID_PASSWORD: "That password isn't right.",
  SESSION_NOT_FRESH: "For your security, sign in again to change how you sign in.",
  AUTHENTICATION_FAILED:
    "That passkey isn't set up for Authoro. Sign in another way, then add it in Settings.",
  PASSKEY_NOT_FOUND: "That passkey isn't set up for Authoro. Sign in another way, then add it in Settings.",
  PREVIOUSLY_REGISTERED: "That passkey is already set up for your account.",
  // The person closed the browser's passkey prompt; nothing to report.
  AUTH_CANCELLED: null,
  REGISTRATION_CANCELLED: null,
};

/**
 * A plain-English message for a Better Auth error, or null when there's
 * nothing to tell the person (they cancelled a passkey prompt).
 */
export function authErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string | null {
  if (!error) return null;
  const known = error.code ? MESSAGES[error.code] : undefined;
  return known === undefined ? fallback : known;
}

export function isStaleSession(error: { code?: string } | null | undefined): boolean {
  return error?.code === "SESSION_NOT_FRESH";
}
