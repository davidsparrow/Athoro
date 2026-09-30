import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { suggestHandle } from "@/lib/profile-validation";
import { getCurrentProfile, requireSession } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your author profile" };

export default async function OnboardingPage() {
  const session = await requireSession("/onboarding");
  if (await getCurrentProfile(session.user.id)) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">Welcome to Authoro</p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight">Set up your author profile</h1>
      <p className="mt-3 leading-relaxed text-ink-muted">
        This is the byline your records carry. It can be your legal name or a pen name. Authoro never requires
        you to publish your legal identity.
      </p>
      <div className="mt-10">
        <OnboardingForm defaultName={session.user.name} defaultHandle={suggestHandle(session.user.name)} />
      </div>
    </div>
  );
}
