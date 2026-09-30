"use client";

import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { withdrawAction, type WithdrawState } from "./actions";

export function WithdrawForm({ proofId, reasons }: { proofId: string; reasons: [string, string][] }) {
  const [state, formAction, pending] = useActionState<WithdrawState, FormData>(
    withdrawAction.bind(null, proofId),
    {},
  );

  return (
    <details className="group mt-4" open={Boolean(state.error) || undefined}>
      <summary className="inline-flex cursor-pointer list-none text-sm font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400 [&::-webkit-details-marker]:hidden">
        Withdraw this record…
      </summary>
      <form action={formAction} className="mt-5 space-y-5 border-t border-line pt-5">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <Field label="Reason" htmlFor="withdraw-reason" hint="Shown on the public record.">
          <select id="withdraw-reason" name="reason" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose a reason
            </option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Note"
          htmlFor="withdraw-note"
          hint="Optional. Shown publicly after the reason, up to 500 characters."
        >
          <textarea id="withdraw-note" name="note" rows={3} maxLength={500} className={inputClass} />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input name="confirm" type="checkbox" required className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            I understand that withdrawal is final. The record stays public, marked withdrawn with this reason,
            and its Authoro Mark will show that it&apos;s withdrawn.
          </span>
        </label>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Withdrawing…" : "Withdraw record"}
        </Button>
      </form>
    </details>
  );
}
