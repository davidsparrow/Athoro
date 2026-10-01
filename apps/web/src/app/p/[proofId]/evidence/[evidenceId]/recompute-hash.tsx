"use client";

import { hashCanonicalJson } from "@authoro/core";
import { useState } from "react";
import { Button } from "@/components/ui";

/** Recomputes an evidence object's hash in the reader's browser, so they needn't take Authoro's word. */
export function RecomputeHash({ payload, expected }: { payload: unknown; expected: string }) {
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-3 text-sm">
      <Button
        variant="secondary"
        onClick={async () => setResult(await hashCanonicalJson(payload))}
        className="whitespace-normal"
      >
        Recompute the hash in your browser
      </Button>
      {result ? (
        <div
          role="status"
          className={`rounded-lg border p-3 ${result === expected ? "border-accent/40 bg-accent-soft" : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"}`}
        >
          <p className="font-medium">
            {result === expected ? "✓ Matches the recorded hash" : "✕ Doesn't match the recorded hash"}
          </p>
          <p className="mt-1 font-mono text-xs break-all text-ink-muted">{result}</p>
        </div>
      ) : null}
    </div>
  );
}
