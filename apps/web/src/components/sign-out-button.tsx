"use client";

import { useFormStatus } from "react-dom";
import { signOutAction } from "@/app/(app)/actions";

function SubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/** A form, so signing out works before hydration and without JavaScript. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <SubmitButton className={className} />
    </form>
  );
}
