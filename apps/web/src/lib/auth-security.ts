import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { safeNextPath } from "./redirects";

/**
 * Changing how an account signs in needs a sign-in within the last hour, so a
 * stolen session cookie alone can't add a passkey or switch off two-step
 * verification. Also used as Better Auth's `session.freshAge`, which guards
 * passkey registration.
 */
export const RECENT_SIGN_IN_SECONDS = 60 * 60;

export function isRecentSignIn(signedInAt: Date, now = new Date()): boolean {
  return now.getTime() - new Date(signedInAt).getTime() < RECENT_SIGN_IN_SECONDS * 1000;
}

const RECENT_SIGN_IN_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
  "/passkey/delete-passkey",
]);

export const SESSION_NOT_FRESH = "SESSION_NOT_FRESH";

/** Enforced at the auth layer, so direct API calls can't skip it. */
export function requireRecentSignIn(): BetterAuthPlugin {
  return {
    id: "require-recent-sign-in",
    hooks: {
      before: [
        {
          matcher: (ctx) => RECENT_SIGN_IN_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session && !isRecentSignIn(session.session.createdAt)) {
              throw new APIError("FORBIDDEN", {
                code: SESSION_NOT_FRESH,
                message: "Sign in again to change how you sign in.",
              });
            }
          }),
        },
      ],
    },
  };
}

/** Magic-link verification decodes its callback once more; mirror that, tolerating stray `%`. */
function decodeCallback(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Better Auth's two-factor challenge cookie (`TWO_FACTOR_COOKIE_NAME` in its two-factor plugin). */
const TWO_FACTOR_COOKIE = "two_factor";
const CHALLENGE_SECONDS = 10 * 60;

/**
 * The two-factor plugin only challenges password sign-ins. This holds back
 * the session a magic link creates for an account with two-step verification
 * on, starts the same challenge the plugin starts for passwords, and sends the
 * author to enter their code. The challenge format is covered by tests.
 */
export function magicLinkTwoFactor(): BetterAuthPlugin {
  return {
    id: "magic-link-two-factor",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/magic-link/verify",
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = ctx.context.newSession;
            if (!(signedIn?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled)
              return;

            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(signedIn!.session.token);
            ctx.context.setNewSession(null);

            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(Date.now() + CHALLENGE_SECONDS * 1000);
            await ctx.context.internalAdapter.createVerificationValue({
              value: signedIn!.user.id,
              identifier,
              expiresAt,
            });
            await ctx.context.internalAdapter.createVerificationValue({
              value: "0",
              identifier: `2fa-attempts-${identifier}`,
              expiresAt,
            });
            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, { maxAge: CHALLENGE_SECONDS });
            await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);

            const next = safeNextPath(decodeCallback(ctx.query?.callbackURL));
            throw ctx.redirect(`/sign-in/two-factor?next=${encodeURIComponent(next)}`);
          }),
        },
      ],
    },
  };
}

export type SecurityEvent =
  | "passkey-added"
  | "passkey-removed"
  | "two-factor-enabled"
  | "two-factor-disabled"
  | "backup-codes-regenerated"
  | "backup-code-used";

type SecurityEventHandler = (event: {
  type: SecurityEvent;
  user: { id: string; email: string; name?: string | null };
  headers: Headers | null;
}) => Promise<void> | void;

const EVENT_PATHS: Record<string, SecurityEvent> = {
  "/passkey/verify-registration": "passkey-added",
  "/passkey/delete-passkey": "passkey-removed",
  "/two-factor/generate-backup-codes": "backup-codes-regenerated",
  "/two-factor/verify-backup-code": "backup-code-used",
};

/**
 * Reports successful sign-in security changes made through Better Auth's
 * endpoints. Turning two-step verification on and off is reported from the
 * user update instead (see auth.ts), since the endpoint that confirms a new
 * authenticator also verifies codes at sign-in.
 */
export function securityEvents(onEvent: SecurityEventHandler): BetterAuthPlugin {
  return {
    id: "security-events",
    hooks: {
      after: [
        {
          matcher: (ctx) => Boolean(EVENT_PATHS[ctx.path ?? ""]),
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) return;
            const type = EVENT_PATHS[ctx.path]!;
            // A backup code is either spent signing in (a new session) or checked while signed in.
            const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
            if (!user) return;
            await onEvent({ type, user, headers: ctx.request?.headers ?? ctx.headers ?? null });
          }),
        },
      ],
    },
  };
}
