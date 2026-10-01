"use client";

import { useActionState } from "react";
import { AccessFields, PresetFields } from "@/components/access-fields";
import { Alert, Button } from "@/components/ui";
import type { EvidencePreset, Visibility } from "@/lib/visibility-labels";
import { changeAccessAction, changePresetAction, type VisibilityState } from "./visibility-actions";

function Feedback({ state }: { state: VisibilityState }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.saved) return <Alert tone="success">{state.saved}</Alert>;
  return null;
}

export function AccessForm({
  proofId,
  ...fields
}: {
  proofId: string;
  defaultVisibility: Visibility;
  defaultEmbargoUntil: string | null;
  defaultShowFingerprint: boolean;
  canUsePro: boolean;
  publishedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<VisibilityState, FormData>(
    changeAccessAction.bind(null, proofId),
    {},
  );
  // Remount the fields after each save so they start from the record's new state.
  const key = `${fields.defaultVisibility}-${fields.defaultEmbargoUntil}-${fields.defaultShowFingerprint}-${fields.publishedAt}`;
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Feedback state={state} />
      <AccessFields key={key} {...fields} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save visibility"}
      </Button>
    </form>
  );
}

export function PresetForm({ proofId, defaultPreset }: { proofId: string; defaultPreset: EvidencePreset }) {
  const [state, formAction, pending] = useActionState<VisibilityState, FormData>(
    changePresetAction.bind(null, proofId),
    {},
  );
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Feedback state={state} />
      <PresetFields key={defaultPreset} defaultPreset={defaultPreset} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save evidence detail"}
      </Button>
    </form>
  );
}
