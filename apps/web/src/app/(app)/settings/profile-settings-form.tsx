"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "@/app/(app)/actions";
import { ProfileFields } from "@/components/profile-fields";
import { Alert, Button } from "@/components/ui";

export function ProfileSettingsForm({
  values,
}: {
  values: { displayName: string; bio: string | null; websiteUrl: string | null; isPublic: boolean };
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {});

  return (
    <form action={formAction} className="space-y-6">
      {state.saved ? <Alert tone="success">Profile saved.</Alert> : null}
      {state.errors?.form ? <Alert tone="error">{state.errors.form}</Alert> : null}
      <ProfileFields values={state.values ?? values} errors={state.errors} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
