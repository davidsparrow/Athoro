"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { reviewEvidenceAction } from "./evidence-actions";

/** Approve or decline one submission. Declining is final, so it asks first. */
export function ReviewEvidence({ proofId, evidenceId }: { proofId: string; evidenceId: string }) {
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approve" | "decline") =>
    startTransition(async () => {
      setError(null);
      const result = await reviewEvidenceAction(proofId, evidenceId, decision);
      if (result?.errors) setError(result.errors.join(" "));
    });

  return (
    <div className="mt-4 space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {confirmingDecline ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Decline for good? It won&apos;t be shown and can&apos;t be approved later.</span>
          <Button variant="danger" className="h-9" disabled={pending} onClick={() => decide("decline")}>
            {pending ? "Declining…" : "Decline"}
          </Button>
          <Button variant="ghost" className="h-9" onClick={() => setConfirmingDecline(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button className="h-9" disabled={pending} onClick={() => decide("approve")}>
            {pending ? "Approving…" : "Approve and publish"}
          </Button>
          <Button variant="secondary" className="h-9" onClick={() => setConfirmingDecline(true)}>
            Decline…
          </Button>
        </div>
      )}
    </div>
  );
}
