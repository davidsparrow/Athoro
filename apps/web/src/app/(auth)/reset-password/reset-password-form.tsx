"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) setError(error.message ?? "Couldn't reset your password. The link may have expired.");
    else setDone(true);
  }

  if (done) {
    return (
      <Alert tone="success">
        Your password has been changed and you&apos;ve been signed out everywhere.{" "}
        <Link href="/sign-in" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
