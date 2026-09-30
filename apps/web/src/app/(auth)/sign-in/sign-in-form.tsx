"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckEmail } from "@/components/check-email";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

type Method = "password" | "link";

export function SignInForm({
  next,
  initialMethod,
  linkError,
}: {
  next: Route;
  initialMethod: Method;
  linkError: boolean;
}) {
  const [method, setMethod] = useState<Method>(initialMethod);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "That sign-in link is invalid or has expired. Request a new one." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    setPending(true);
    setError(null);
    setNotice(null);

    if (method === "link") {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: next,
        newUserCallbackURL: "/onboarding",
        errorCallbackURL: "/sign-in?method=link&error=link",
      });
      setPending(false);
      if (error) setError(error.message ?? "Couldn't send a sign-in link. Please try again.");
      else setLinkSentTo(email);
      return;
    }

    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get("password")),
      callbackURL: next,
    });
    setPending(false);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setNotice("Confirm your email address first. We've sent you a new confirmation link.");
      } else {
        setError(error.message ?? "Couldn't sign you in. Please try again.");
      }
      return;
    }
    // Full navigation so every server-rendered part of the page picks up the new session.
    window.location.assign(next);
  }

  if (linkSentTo) {
    return <CheckEmail email={linkSentTo} message="We sent a sign-in link to" />;
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="grid grid-cols-2 rounded-lg border border-line bg-paper-sunken p-1 text-sm"
      >
        {(["password", "link"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={method === option}
            onClick={() => {
              setMethod(option);
              setError(null);
              setNotice(null);
            }}
            className={`rounded-md py-1.5 transition-colors ${method === option ? "bg-paper-raised font-medium text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {option === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        {method === "password" ? (
          <Field
            label="Password"
            htmlFor="password"
            hint={
              <Link href="/forgot-password" className="underline underline-offset-4 hover:text-ink">
                Forgot your password?
              </Link>
            }
          >
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </Field>
        ) : (
          <p className="text-sm text-ink-muted">
            We&apos;ll email you a link that signs you in. It works once and expires after 10 minutes.
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : method === "password" ? "Sign in" : "Send sign-in link"}
        </Button>
      </form>
    </div>
  );
}
