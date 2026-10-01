import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv } from "@/env";
import { deploymentOrigins } from "@/lib/app-url";
import { recordAudit } from "@/lib/audit";
import {
  magicLinkTwoFactor,
  RECENT_SIGN_IN_SECONDS,
  requireRecentSignIn,
  securityEvents,
  type SecurityEvent,
} from "@/lib/auth-security";
import { generateBackupCodes } from "@/lib/backup-codes";
import { sendEmail, type EmailMessage } from "@/lib/email/send";
import {
  magicLinkEmail,
  resetPasswordEmail,
  securityNoticeEmail,
  verificationEmail,
} from "@/lib/email/templates";

/**
 * Sends after the response so response timing doesn't reveal whether an
 * address has an account.
 */
function sendLater(message: EmailMessage) {
  after(() =>
    sendEmail(message).catch((error) => console.error("Failed to send email", message.subject, error)),
  );
}

function requestHeaders(context: { headers?: Headers; request?: Request } | null | undefined) {
  return context?.headers ?? context?.request?.headers ?? null;
}

const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;

/** Audits a change to how an account signs in and tells the account holder by email. */
async function reportSecurityEvent({
  type,
  user,
  headers,
}: {
  type: SecurityEvent;
  user: { id: string; email: string; name?: string | null };
  headers: Headers | null;
}) {
  await recordAudit({
    actorType: "user",
    actorId: user.id,
    action: `auth.${type.replaceAll("-", "_")}`,
    headers,
  });
  sendLater(securityNoticeEmail(user.email, user.name, type, `${appUrl}/settings#security`));
}

export const auth = betterAuth({
  appName: "Authoro",
  baseURL: appUrl,
  // Preview deployments are reachable at both their branch and deployment URLs.
  trustedOrigins: deploymentOrigins(process.env),
  secret: serverEnv().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendLater(resetPasswordEmail(user.email, user.name, url));
    },
    onPasswordReset: async ({ user }, request) => {
      await recordAudit({
        actorType: "user",
        actorId: user.id,
        action: "auth.password_reset",
        headers: request?.headers,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Unverified users who try to sign in get a fresh link.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      sendLater(verificationEmail(user.email, user.name, url));
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Registering a passkey needs a recent sign-in; auth-security applies the same rule elsewhere.
    freshAge: RECENT_SIGN_IN_SECONDS,
  },

  rateLimit: {
    // Stored in Postgres so limits hold across serverless instances. Enabled in production only.
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/passkey/verify-authentication": { window: 60, max: 10 },
    },
  },

  databaseHooks: {
    user: {
      update: {
        // Turning two-step verification on (confirming the first code) or off updates the user.
        after: async (user, context) => {
          const enabled = context?.path === "/two-factor/verify-totp" && user.twoFactorEnabled;
          const disabled = context?.path === "/two-factor/disable" && !user.twoFactorEnabled;
          if (enabled || disabled) {
            await reportSecurityEvent({
              type: enabled ? "two-factor-enabled" : "two-factor-disabled",
              user,
              headers: requestHeaders(context),
            });
          }
        },
      },
      create: {
        after: async (user, context) => {
          await recordAudit({
            actorType: "user",
            actorId: user.id,
            action: "auth.user_created",
            headers: requestHeaders(context),
          });
        },
      },
    },
    session: {
      create: {
        after: async (session, context) => {
          const headers = requestHeaders(context);
          // After the response: a sign-in waiting for its second factor creates a session and
          // deletes it in the same request, and that one shouldn't be reported.
          after(async () => {
            const [kept] = await db
              .select({ id: schema.session.id })
              .from(schema.session)
              .where(eq(schema.session.id, session.id))
              .limit(1);
            if (!kept) return;
            await recordAudit({
              actorType: "user",
              actorId: session.userId,
              action: "auth.session_created",
              metadata: { path: context?.path ?? null },
              headers,
            });
          });
        },
      },
    },
  },

  plugins: [
    magicLink({
      expiresIn: 60 * 10,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        sendLater(magicLinkEmail(email, url));
      },
    }),
    twoFactor({
      issuer: "Authoro",
      // Accounts created by magic link have no password; a recent sign-in guards changes instead.
      allowPasswordless: true,
      backupCodeOptions: { storeBackupCodes: "encrypted", customBackupCodesGenerate: generateBackupCodes },
    }),
    passkey({
      rpID: new URL(appUrl).hostname,
      rpName: "Authoro",
      origin: deploymentOrigins(process.env),
    }),
    magicLinkTwoFactor(),
    requireRecentSignIn(),
    securityEvents(reportSecurityEvent),
    // Must stay last so it can set cookies from server actions.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
