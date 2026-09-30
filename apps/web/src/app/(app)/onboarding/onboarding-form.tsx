"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createProfileAction, checkHandleAction, type ProfileFormState } from "@/app/(app)/actions";
import { ProfileFields } from "@/components/profile-fields";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { suggestHandle } from "@/lib/profile-validation";

export function OnboardingForm({
  defaultName,
  defaultHandle,
}: {
  defaultName: string;
  defaultHandle: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(createProfileAction, {});
  const [handle, setHandle] = useState(state.values?.handle ?? defaultHandle);
  const [handleTouched, setHandleTouched] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const latestCheck = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Checks run debounced, and a slower response never overwrites a newer one.
  function updateHandle(value: string) {
    setHandle(value);
    clearTimeout(timer.current);
    const check = ++latestCheck.current;
    if (!value) {
      setAvailability(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const result = await checkHandleAction(value);
      if (check === latestCheck.current) setAvailability(result);
    }, 350);
  }

  useEffect(() => {
    if (!defaultHandle) return;
    let cancelled = false;
    checkHandleAction(defaultHandle).then((result) => {
      if (!cancelled && latestCheck.current === 0) setAvailability(result);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [defaultHandle]);

  const values = state.values ?? { displayName: defaultName, isPublic: true };
  const handleError =
    state.errors?.handle ?? (availability && !availability.available ? availability.message : null);

  return (
    <form action={formAction} className="space-y-6">
      {state.errors?.form ? <Alert tone="error">{state.errors.form}</Alert> : null}
      <div
        onChange={(event) => {
          const target = event.target as HTMLInputElement;
          if (target.name === "displayName" && !handleTouched) updateHandle(suggestHandle(target.value));
        }}
        className="space-y-6"
      >
        <ProfileFields
          values={values}
          errors={state.errors}
          afterDisplayName={
            <Field
              label="Handle"
              htmlFor="handle"
              error={handleError || null}
              hint={
                availability?.available
                  ? availability.message
                  : "Your public address on Authoro. This can't be changed later."
              }
            >
              <div className="flex items-stretch overflow-hidden rounded-lg border border-line bg-paper-raised focus-within:border-accent">
                <span className="flex items-center border-r border-line bg-paper-sunken px-3 text-sm text-ink-muted">
                  authoro.net/a/
                </span>
                <input
                  id="handle"
                  name="handle"
                  required
                  maxLength={40}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={handle}
                  onChange={(event) => {
                    setHandleTouched(true);
                    updateHandle(event.target.value.toLowerCase());
                  }}
                  aria-invalid={Boolean(handleError)}
                  className={`${inputClass} rounded-none border-0 focus:outline-none`}
                />
              </div>
            </Field>
          }
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Create profile"}
      </Button>
    </form>
  );
}
