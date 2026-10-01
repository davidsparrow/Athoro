"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { normalizeBackupCode } from "@/lib/backup-codes";

const RESTART_CODES = new Set(["INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"]);

export function TwoFactorForm({ next }: { next: Route }) {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = String(new FormData(event.currentTarget).get("code"));
    setPending(true);
    setError(null);
    const { error } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: typed.replace(/\s+/g, "") })
        : await authClient.twoFactor.verifyBackupCode({ code: normalizeBackupCode(typed) });
    if (!error) {
      // Full navigation so every server-rendered part of the page picks up the new session.
      window.location.assign(next);
      return;
    }
    setPending(false);
    setExpired(RESTART_CODES.has(error.code ?? ""));
    setError(authErrorMessage(error, "Couldn't check that code. Please try again."));
  }

  const signInAgain = `/sign-in?next=${encodeURIComponent(next)}` as Route;

  if (expired) {
    return (
      <div className="space-y-6">
        <Alert tone="error">{error}</Alert>
        <Link href={signInAgain} className="inline-block text-sm underline underline-offset-4">
          Sign in again
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        {mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of the backup codes you saved when you turned on two-step verification. Each code works once."}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label={mode === "totp" ? "Code" : "Backup code"} htmlFor="code">
        <input
          key={mode}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={mode === "totp" ? "numeric" : "text"}
          pattern={mode === "totp" ? "[0-9 ]{6,7}" : undefined}
          maxLength={mode === "totp" ? 7 : 32}
          spellCheck={false}
          className={`${inputClass} font-mono text-lg tracking-widest`}
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
      <div className="flex flex-wrap justify-between gap-3 text-sm text-ink-muted">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "totp" ? "backup" : "totp");
            setError(null);
          }}
          className="underline underline-offset-4 hover:text-ink"
        >
          {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app instead"}
        </button>
        <Link href={signInAgain} className="underline underline-offset-4 hover:text-ink">
          Sign in another way
        </Link>
      </div>
    </form>
  );
}
