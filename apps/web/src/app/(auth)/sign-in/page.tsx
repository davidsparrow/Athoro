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
  // Changing sign-in security asks a signed-in author to sign in again (see auth-security.ts).
  const reauth = params.reauth === "1";
  if (!reauth && (await getSession())) redirect(next);

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">{reauth ? "Confirm it's you" : "Sign in"}</h1>
      {reauth ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Changing how you sign in needs a sign-in from the last hour. Sign in again to continue.
        </p>
      ) : null}
      <div className="mt-8">
        <SignInForm
          next={next}
          initialMethod={params.method === "link" ? "link" : "password"}
          linkError={typeof params.error === "string"}
        />
      </div>
      {reauth ? null : (
        <p className="mt-8 text-sm text-ink-muted">
          New to Authoro?{" "}
          <Link href="/sign-up" className="text-ink underline underline-offset-4">
            Create an account
          </Link>
        </p>
      )}
    </>
  );
}
