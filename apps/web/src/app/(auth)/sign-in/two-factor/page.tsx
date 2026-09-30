import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/redirects";
import { getSession } from "@/lib/session";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function TwoFactorPage({ searchParams }: PageProps<"/sign-in/two-factor">) {
  const next = safeNextPath((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight">Two-step verification</h1>
      <div className="mt-8">
        <TwoFactorForm next={next} />
      </div>
    </>
  );
}
