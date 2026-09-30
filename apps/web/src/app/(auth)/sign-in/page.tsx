import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/redirects";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getSession()) redirect(next);

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">Sign in</h1>
      <div className="mt-8">
        <SignInForm
          next={next}
          initialMethod={params.method === "link" ? "link" : "password"}
          linkError={typeof params.error === "string"}
        />
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        New to Authoro?{" "}
        <Link href="/sign-up" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
