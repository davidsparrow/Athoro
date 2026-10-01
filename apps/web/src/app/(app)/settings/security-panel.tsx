"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { QrCode } from "@/components/qr-code";
import { Alert, Button, buttonClass, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, isStaleSession } from "@/lib/auth-messages";
import { formatDate } from "@/lib/format";

export interface PasskeySummary {
  id: string;
  name: string | null;
  createdAt: string | null;
  backedUp: boolean;
}

type AuthError = { code?: string; message?: string } | null;
/** Returns the message to show, or null when there's nothing to say (or the sign-in notice covers it). */
type ErrorHandler = (error: AuthError, fallback: string) => string | null;

const REAUTH_HREF = `/sign-in?reauth=1&next=${encodeURIComponent("/settings#security")}` as Route;

export function SecurityPanel({
  passkeys,
  twoFactorEnabled,
  hasPassword,
  recentSignIn,
}: {
  passkeys: PasskeySummary[];
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  recentSignIn: boolean;
}) {
  const router = useRouter();
  const [stale, setStale] = useState(!recentSignIn);

  const onError: ErrorHandler = (error, fallback) => {
    if (isStaleSession(error)) {
      setStale(true);
      return null;
    }
    return authErrorMessage(error, fallback);
  };
  const shared = { locked: stale, onError, onChange: () => router.refresh() };

  return (
    <div className="space-y-8">
      {stale ? (
        <Alert tone="info">
          <p>
            Changing how you sign in needs a sign-in from the last hour.{" "}
            <Link href={REAUTH_HREF} className="font-medium underline underline-offset-4">
              Sign in again
            </Link>
          </p>
        </Alert>
      ) : null}
      <Passkeys passkeys={passkeys} {...shared} />
      <div className="border-t border-line pt-8">
        <Authenticator enabled={twoFactorEnabled} hasPassword={hasPassword} {...shared} />
      </div>
    </div>
  );
}

interface SectionProps {
  locked: boolean;
  onError: ErrorHandler;
  onChange: () => void;
}

type Message = { tone: "success" | "error"; text: string } | null;

function Passkeys({ passkeys, locked, onError, onChange }: SectionProps & { passkeys: PasskeySummary[] }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { error } = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setPending(false);
    if (error) {
      const text = onError(error, "Couldn't add the passkey. Please try again.");
      if (text) setMessage({ tone: "error", text });
      return;
    }
    setName("");
    setMessage({ tone: "success", text: "Passkey added. Next time, sign in with it instead of a password." });
    onChange();
  }

  return (
    <section aria-labelledby="passkeys-heading">
      <h3 id="passkeys-heading" className="text-sm font-medium">
        Passkeys
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        Sign in with your fingerprint, face or screen lock instead of a password. A passkey covers both steps
        on its own, so it never asks for a code.
      </p>
      {message ? (
        <div className="mt-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}
      {passkeys.length ? (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
          {passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              locked={locked}
              onError={onError}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="passkeyName" className="sr-only">
          Passkey name
        </label>
        <input
          id="passkeyName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name it, e.g. MacBook (optional)"
          maxLength={60}
          disabled={locked}
          className={`${inputClass} max-w-xs`}
        />
        <Button type="submit" variant="secondary" disabled={locked || pending}>
          {pending ? "Waiting for your device…" : "Add a passkey"}
        </Button>
      </form>
    </section>
  );
}

function PasskeyRow({ passkey, locked, onError, onChange }: SectionProps & { passkey: PasskeySummary }) {
  const [mode, setMode] = useState<"view" | "rename" | "remove">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: AuthError }>, fallback: string) {
    setPending(true);
    setError(null);
    const { error } = await action();
    setPending(false);
    if (error) return setError(onError(error, fallback));
    setMode("view");
    onChange();
  }

  const label = passkey.name?.trim() || "Passkey";
  return (
    <li className="px-4 py-3">
      {mode === "rename" ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name")).trim();
            void run(
              () => authClient.passkey.updatePasskey({ id: passkey.id, name: name || "Passkey" }),
              "Couldn't rename the passkey.",
            );
          }}
        >
          <label htmlFor={`rename-${passkey.id}`} className="sr-only">
            New name
          </label>
          <input
            id={`rename-${passkey.id}`}
            name="name"
            defaultValue={passkey.name ?? ""}
            maxLength={60}
            autoFocus
            className={`${inputClass} max-w-xs`}
          />
          <Button type="submit" variant="secondary" disabled={pending}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="font-medium">{label}</span>
            <span className="block text-xs text-ink-muted">
              {passkey.createdAt ? `Added ${formatDate(passkey.createdAt)} · ` : ""}
              {passkey.backedUp ? "Synced across your devices" : "Saved on one device"}
            </span>
          </span>
          {mode === "remove" ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Remove {label}?</span>
              <Button
                variant="danger"
                className="h-8"
                disabled={pending}
                onClick={() =>
                  run(
                    () => authClient.passkey.deletePasskey({ id: passkey.id }),
                    "Couldn't remove the passkey.",
                  )
                }
              >
                Remove
              </Button>
              <Button variant="ghost" className="h-8" onClick={() => setMode("view")}>
                Keep
              </Button>
            </span>
          ) : (
            <span className="flex gap-1">
              <Button variant="ghost" className="h-8" onClick={() => setMode("rename")}>
                Rename
              </Button>
              <Button variant="ghost" className="h-8" disabled={locked} onClick={() => setMode("remove")}>
                Remove
              </Button>
            </span>
          )}
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p> : null}
    </li>
  );
}

type Step =
  | { name: "idle" }
  | { name: "password"; purpose: "enable" | "disable" | "codes" }
  | { name: "scan"; totpURI: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[]; heading: string };

function Authenticator({
  enabled,
  hasPassword,
  locked,
  onError,
  onChange,
}: SectionProps & { enabled: boolean; hasPassword: boolean }) {
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(purpose: "enable" | "disable" | "codes", password?: string) {
    setPending(true);
    setError(null);
    const body = password ? { password } : {};
    if (purpose === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ ...body, issuer: "Authoro" });
      setPending(false);
      if (error || !data || !("totpURI" in data) || !data.totpURI) {
        return setError(onError(error, "Couldn't start setting up your authenticator."));
      }
      return setStep({ name: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
    }
    if (purpose === "disable") {
      const { error } = await authClient.twoFactor.disable(body);
      setPending(false);
      if (error) return setError(onError(error, "Couldn't turn off two-step verification."));
      setStep({ name: "idle" });
      return onChange();
    }
    const { data, error } = await authClient.twoFactor.generateBackupCodes(body);
    setPending(false);
    if (error || !data) return setError(onError(error, "Couldn't create new backup codes."));
    setStep({ name: "codes", backupCodes: data.backupCodes, heading: "Your new backup codes" });
  }

  function begin(purpose: "enable" | "disable" | "codes") {
    setError(null);
    if (hasPassword) setStep({ name: "password", purpose });
    else void start(purpose);
  }

  async function confirm(event: FormEvent<HTMLFormElement>, backupCodes: string[]) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s+/g, "");
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return setError(onError(error, "That code didn't work. Please try again."));
    setStep({ name: "codes", backupCodes, heading: "Save your backup codes" });
  }

  const intro = enabled
    ? "On. Signing in with a password or an email link also asks for a code from your authenticator app."
    : "After your password or email link, also ask for a 6-digit code from an app such as 1Password, Google Authenticator or Authy.";

  let body: ReactNode;
  if (step.name === "password") {
    body = (
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void start(step.purpose, String(new FormData(event.currentTarget).get("password")));
        }}
      >
        <Field label="Your password" htmlFor="twoFactorPassword">
          <input
            id="twoFactorPassword"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className={`${inputClass} max-w-xs`}
          />
        </Field>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={step.purpose === "disable" ? "danger" : "primary"}
            disabled={pending}
          >
            {step.purpose === "enable"
              ? "Continue"
              : step.purpose === "disable"
                ? "Turn off two-step verification"
                : "Create new backup codes"}
          </Button>
          <Button variant="ghost" onClick={() => setStep({ name: "idle" })}>
            Cancel
          </Button>
        </div>
      </form>
    );
  } else if (step.name === "scan") {
    const secret = new URL(step.totpURI).searchParams.get("secret") ?? "";
    body = (
      <div className="mt-4 space-y-5">
        <ol className="space-y-5 text-sm">
          <li>
            <p className="font-medium">1. Scan this with your authenticator app</p>
            <div className="mt-3 flex flex-wrap items-start gap-5">
              <QrCode value={step.totpURI} label="QR code for your authenticator app" />
              <div className="max-w-xs text-ink-muted">
                <p>Can&apos;t scan it? Enter this key instead:</p>
                <code className="mt-2 block rounded bg-paper-sunken px-3 py-2 font-mono text-xs break-all text-ink">
                  {secret.match(/.{1,4}/g)?.join(" ")}
                </code>
              </div>
            </div>
          </li>
          <li>
            <p className="font-medium">2. Enter the 6-digit code it shows</p>
            <form
              onSubmit={(event) => confirm(event, step.backupCodes)}
              className="mt-3 flex flex-wrap gap-2"
            >
              <label htmlFor="setupCode" className="sr-only">
                Code
              </label>
              <input
                id="setupCode"
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                className={`${inputClass} max-w-40 font-mono tracking-widest`}
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Checking…" : "Turn on"}
              </Button>
              <Button variant="ghost" onClick={() => setStep({ name: "idle" })}>
                Cancel
              </Button>
            </form>
          </li>
        </ol>
      </div>
    );
  } else if (step.name === "codes") {
    body = (
      <BackupCodes
        heading={step.heading}
        codes={step.backupCodes}
        onDone={() => {
          setStep({ name: "idle" });
          onChange();
        }}
      />
    );
  } else {
    body = (
      <div className="mt-4 flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button variant="secondary" disabled={locked || pending} onClick={() => begin("codes")}>
              Get new backup codes
            </Button>
            <Button variant="danger" disabled={locked || pending} onClick={() => begin("disable")}>
              Turn off
            </Button>
          </>
        ) : (
          <Button variant="secondary" disabled={locked || pending} onClick={() => begin("enable")}>
            Set up an authenticator app
          </Button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="authenticator-heading">
      <h3 id="authenticator-heading" className="text-sm font-medium">
        Two-step verification
      </h3>
      <p className="mt-1 text-sm text-ink-muted">{intro}</p>
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {body}
    </section>
  );
}

function BackupCodes({ heading, codes, onDone }: { heading: string; codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Authoro backup codes\n\nEach code signs you in once if you lose your authenticator app.\n\n${codes.join("\n")}\n`;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-line bg-paper-sunken p-5">
      <div>
        <p className="font-medium">{heading}</p>
        <p className="mt-1 text-sm text-ink-muted">
          If you lose your authenticator app, a backup code or a passkey is the only way back in. Each code
          works once. Keep them somewhere safe, such as a password manager. They won&apos;t be shown again.
        </p>
      </div>
      <ul className="grid max-w-sm grid-cols-2 gap-x-8 gap-y-1 font-mono text-sm" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="authoro-backup-codes.txt"
          className={buttonClass("secondary")}
        >
          Download
        </a>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>I&apos;ve saved my backup codes.</span>
      </label>
      <Button disabled={!saved} onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
