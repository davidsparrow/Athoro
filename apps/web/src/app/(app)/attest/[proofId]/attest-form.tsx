"use client";

import { AUTHOR_ATTESTATION_STATEMENTS, CURRENT_ATTESTATION_STATEMENT_VERSION } from "@authoro/core";
import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { attestAction, discardAction, type AttestState } from "./actions";

export function AttestForm({ proofId, byline }: { proofId: string; byline: string }) {
  const [state, formAction, pending] = useActionState<AttestState, FormData>(
    attestAction.bind(null, proofId),
    {},
  );
  const { statement, notice } = AUTHOR_ATTESTATION_STATEMENTS[CURRENT_ATTESTATION_STATEMENT_VERSION];

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <blockquote className="border-l-2 border-accent pl-5">
          <p className="font-serif text-xl leading-relaxed">{statement}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{notice}</p>
        </blockquote>
        <Field
          label="Type your full legal name"
          htmlFor="typedName"
          hint={`Kept private. Authoro stores only a salted hash of what you type. Your public byline stays “${byline}”.`}
        >
          <input
            id="typedName"
            name="typedName"
            required
            minLength={2}
            maxLength={200}
            autoComplete="name"
            className={`${inputClass} font-serif text-lg`}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input name="agree" type="checkbox" required className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>I agree and attest.</span>
        </label>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Registering…" : "Register this work"}
        </Button>
      </form>
      <form action={discardAction.bind(null, proofId)} className="border-t border-line pt-6">
        <p className="text-sm text-ink-muted">Something wrong? Discard this draft and start again.</p>
        <Button type="submit" variant="danger" className="mt-3">
          Discard draft
        </Button>
      </form>
    </div>
  );
}
