import type { Metadata } from "next";
import { requireAuthor } from "@/lib/session";
import { RegisterWizard } from "./register-wizard";

export const metadata: Metadata = { title: "Register a work" };

export default async function RegisterPage() {
  const { profile } = await requireAuthor("/register");
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl tracking-tight">Register a work</h1>
      <p className="mt-2 text-ink-muted">
        Creates a permanent, public record of this version of your work, bylined {profile.displayName}.
      </p>
      <div className="mt-10">
        <RegisterWizard byline={profile.displayName} />
      </div>
    </div>
  );
}
