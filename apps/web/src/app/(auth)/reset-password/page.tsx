import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const validToken = typeof token === "string" && token.length > 0 && !error;

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">Choose a new password</h1>
      <div className="mt-8">
        {validToken ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Alert tone="error">
            This reset link is invalid or has expired.{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              Request a new one
            </Link>
            .
          </Alert>
        )}
      </div>
    </>
  );
}
