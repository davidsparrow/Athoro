"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckEmail } from "@/components/check-email";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password: String(form.get("password")),
      callbackURL: "/onboarding",
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <CheckEmail
        email={sentTo}
        message="We sent a confirmation link to"
        onResend={() => authClient.sendVerificationEmail({ email: sentTo, callbackURL: "/onboarding" })}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field
        label="Name"
        htmlFor="name"
        hint="Your own name or the name you publish under. You can use a pen name."
      >
        <input id="name" name="name" autoComplete="name" required maxLength={80} className={inputClass} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Prefer no password?{" "}
        <Link href="/sign-in?method=link" className="text-ink underline underline-offset-4">
          Get a sign-in link
        </Link>
      </p>
    </form>
  );
}
