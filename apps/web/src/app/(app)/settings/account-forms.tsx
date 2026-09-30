"use client";

import { useActionState, useState, type FormEvent } from "react";
import { setPasswordAction, type SetPasswordState } from "@/app/(app)/actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirm"))) {
      setResult({ tone: "error", message: "The new passwords don't match." });
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setResult({ tone: "error", message: error.message ?? "Couldn't change your password." });
      return;
    }
    formElement.reset();
    setResult({ tone: "success", message: "Password changed. Other sessions were signed out." });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {result ? <Alert tone={result.tone}>{result.message}</Alert> : null}
      <Field label="Current password" htmlFor="currentPassword">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 10 characters.">
        <input
          id="newPassword"
          name="newPassword"
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
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(setPasswordAction, {});

  if (state.saved) return <Alert tone="success">Password added. You can now sign in with it.</Alert>;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
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
      <Field label="Confirm password" htmlFor="confirm">
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Add password"}
      </Button>
    </form>
  );
}

export function SignOutOtherSessions() {
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function revoke() {
    setStatus("pending");
    const { error } = await authClient.revokeOtherSessions();
    setStatus(error ? "error" : "done");
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Button variant="secondary" onClick={revoke} disabled={status === "pending" || status === "done"}>
        {status === "done" ? "Signed out elsewhere" : "Sign out other sessions"}
      </Button>
      {status === "error" ? <span className="text-ink-muted">Something went wrong. Try again.</span> : null}
    </div>
  );
}
