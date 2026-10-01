"use client";

import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { revokeEvidenceAction, type EvidenceFormState } from "./evidence-actions";

/** The owner revokes evidence added after registration; it stays visible, marked revoked. */
export function RevokeEvidenceForm({ proofId, evidenceId }: { proofId: string; evidenceId: string }) {
  const [state, formAction, pending] = useActionState<EvidenceFormState, FormData>(
    revokeEvidenceAction.bind(null, proofId, evidenceId),
    {},
  );
  const id = `revoke-${evidenceId}`;
  return (
    <details className="mt-4 border-t border-line pt-3" open={Boolean(state.errors?.length) || undefined}>
      <summary className="inline-flex cursor-pointer list-none text-xs font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
        Revoke…
      </summary>
      <form action={formAction} className="mt-4 space-y-4">
        {state.errors?.length ? <Alert tone="error">{state.errors.join(" ")}</Alert> : null}
        <Field
          label="Note"
          htmlFor={`${id}-note`}
          hint="Optional. Shown publicly with the revocation, up to 300 characters."
        >
          <input id={`${id}-note`} name="note" maxLength={300} className={inputClass} />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input name="confirm" type="checkbox" required className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Revoke this evidence. It stays on the record, struck through and dated. This can&apos;t be undone.
          </span>
        </label>
        <Button type="submit" variant="danger" className="h-9" disabled={pending}>
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </form>
    </details>
  );
}
