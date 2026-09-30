import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Register works, attest to them, and give readers a record they can check.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
