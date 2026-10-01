"use client";

import { abbreviateHash } from "@authoro/core";
import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { hashReportFile, MAX_REPORT_BYTES } from "@/lib/report-hash";

/**
 * Lets a reader check a downloaded report against the fingerprint its
 * submitter recorded. The file is hashed in the browser and never uploaded.
 */
export function ReportCheck({ reportHash, supplier }: { reportHash: string; supplier: string }) {
  const [result, setResult] = useState<{ name: string; matched: boolean } | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) {
      return setResult({ error: `Files can be at most ${formatBytes(MAX_REPORT_BYTES)}.` });
    }
    setBusy(true);
    try {
      setResult({ name: file.name, matched: (await hashReportFile(file)) === reportHash });
    } catch {
      setResult({ error: "Couldn't read that file. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 text-xs text-ink-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Report fingerprint{" "}
          <code className="font-mono" title={reportHash}>
            {abbreviateHash(reportHash, 8, 6)}
          </code>
        </span>
        <span aria-hidden>·</span>
        <label className="cursor-pointer text-ink underline underline-offset-4 hover:text-accent">
          {busy ? "Checking…" : "Check a downloaded copy"}
          <input type="file" className="sr-only" onChange={(event) => check(event.target.files?.[0])} />
        </label>
      </p>
      {result ? (
        <p role="status" className="mt-1.5">
          {"error" in result ? (
            result.error
          ) : result.matched ? (
            <>
              <span className="font-medium text-accent">✓ Matches.</span> {result.name} is the report{" "}
              {supplier} fingerprinted.
            </>
          ) : (
            <>
              <span className="font-medium text-ink">No match.</span> {result.name} differs from the report{" "}
              {supplier} fingerprinted. It may be another or an edited copy.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
