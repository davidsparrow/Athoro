import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { after } from "next/server";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv } from "@/env";
import { deploymentOrigins } from "@/lib/app-url";
import { recordAudit } from "@/lib/audit";
import { sendEmail, type EmailMessage } from "@/lib/email/send";
import { magicLinkEmail, resetPasswordEmail, verificationEmail } from "@/lib/email/templates";

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

export const auth = betterAuth({
  appName: "Authoro",
  baseURL: serverEnv().NEXT_PUBLIC_APP_URL,
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
    },
  },

  databaseHooks: {
    user: {
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
          await recordAudit({
            actorType: "user",
            actorId: session.userId,
            action: "auth.session_created",
            metadata: { path: context?.path ?? null },
            headers: requestHeaders(context),
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
    // Must stay last so it can set cookies from server actions.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
