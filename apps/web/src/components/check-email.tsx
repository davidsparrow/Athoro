"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";

/** Confirmation shown after an email with a link was sent, with a rate-limited resend. */
export function CheckEmail({
  email,
  message,
  onResend,
}: {
  email: string;
  message: string;
  onResend?: () => Promise<{ error: { message?: string } | null }>;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    if (!onResend) return;
    setStatus("sending");
    const { error } = await onResend();
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="space-y-4">
      <Alert tone="success">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-ink-muted">
          {message} <span className="font-medium text-ink">{email}</span>. The link signs you in.
        </p>
      </Alert>
      {onResend ? (
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Button variant="secondary" onClick={resend} disabled={status === "sending" || status === "sent"}>
            {status === "sent" ? "Sent again" : status === "sending" ? "Sending…" : "Resend email"}
          </Button>
          {status === "error" ? <span>Couldn&apos;t resend yet. Wait a minute and try again.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
