import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Enter your account email and we&apos;ll send you a link to choose a new password.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        <Link href="/sign-in" className="text-ink underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
