import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { passkey } from "@/db/schema";
import { listApiKeys } from "@/lib/api/keys";
import { isRecentSignIn } from "@/lib/auth-security";
import { requireAuthor } from "@/lib/session";
import { ChangePasswordForm, SetPasswordForm, SignOutOtherSessions } from "./account-forms";
import { ApiKeysPanel } from "./api-keys-panel";
import { ProfileSettingsForm } from "./profile-settings-form";
import { SecurityPanel } from "./security-panel";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { session, profile } = await requireAuthor("/settings");
  const accounts = await auth.api.listUserAccounts({ headers: await headers() });
  const hasPassword = accounts.some((account) => account.providerId === "credential");
  const apiKeys = await listApiKeys(db, session.user.id);
  const passkeys = await db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, backedUp: passkey.backedUp })
    .from(passkey)
    .where(eq(passkey.userId, session.user.id))
    .orderBy(asc(passkey.createdAt));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-12">
      <h1 className="font-serif text-3xl tracking-tight">Settings</h1>

      <Card>
        <h2 className="font-medium">Author profile</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Handle <span className="font-mono text-ink">@{profile.handle}</span> is permanent.
        </p>
        <div className="mt-6">
          <ProfileSettingsForm
            values={{
              displayName: profile.displayName,
              bio: profile.bio,
              websiteUrl: profile.websiteUrl,
              isPublic: profile.isPublic,
            }}
          />
        </div>
      </Card>

      <Card id="security">
        <h2 className="font-medium">Sign-in security</h2>
        <p className="mt-1 mb-6 text-sm text-ink-muted">
          Your account is what attests to your work, so it&apos;s worth protecting with more than a password
          or an inbox.
        </p>
        <SecurityPanel
          passkeys={passkeys.map((key) => ({ ...key, createdAt: key.createdAt?.toISOString() ?? null }))}
          twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
          hasPassword={hasPassword}
          recentSignIn={isRecentSignIn(session.session.createdAt)}
        />
      </Card>

      <Card>
        <h2 className="font-medium">API keys</h2>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Let your tools prepare registrations through the{" "}
          <a
            href="https://github.com/davidsparrow/Authoro/blob/main/docs/api.md"
            className="underline underline-offset-4"
          >
            Authoro API
          </a>
          . Anything a key submits waits for you to attest before it becomes public.
        </p>
        <ApiKeysPanel
          keys={apiKeys.map((key) => ({
            ...key,
            createdAt: key.createdAt.toISOString(),
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
          }))}
        />
      </Card>

      <Card>
        <h2 className="font-medium">Account</h2>
        <dl className="mt-4 text-sm">
          <dt className="text-ink-muted">Email</dt>
          <dd>{session.user.email}</dd>
        </dl>
        <div className="mt-6 border-t border-line pt-6">
          <h3 className="text-sm font-medium">{hasPassword ? "Change password" : "Add a password"}</h3>
          {hasPassword ? null : (
            <p className="mt-1 text-sm text-ink-muted">
              You sign in with email links. Add a password to sign in without checking your inbox.
            </p>
          )}
          <div className="mt-4">{hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />}</div>
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <h3 className="text-sm font-medium">Sessions</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Sign out of Authoro on every other device and browser.
          </p>
          <div className="mt-4">
            <SignOutOtherSessions />
          </div>
        </div>
      </Card>
    </div>
  );
}
