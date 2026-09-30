"use client";

import { fingerprintDocument, fingerprintPastedText, inferMediaType } from "@authoro/core";
import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { formatBytes } from "@/lib/format";

export interface CandidateFingerprint {
  contentHash: string;
  textHash: string | null;
  label: string;
}

/** Up to 100 MB, matching registration; checking a copy never uploads it. */
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Lets a reader choose a file or paste text, fingerprints it in the browser,
 * and hands back only the hashes.
 */
export function DocumentInput({
  onFingerprint,
  busyLabel = "Checking…",
  actionLabel = "Check",
}: {
  onFingerprint: (fingerprint: CandidateFingerprint) => Promise<void> | void;
  busyLabel?: string;
  actionLabel?: string;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<CandidateFingerprint>) {
    setBusy(true);
    setError(null);
    try {
      await onFingerprint(await task());
    } catch {
      setError("Couldn't read that document. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(`Files can be at most ${formatBytes(MAX_BYTES)}.`);
    void run(async () => {
      const fp = await fingerprintDocument({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: inferMediaType(file.name, file.type),
      });
      return { contentHash: fp.contentHash, textHash: fp.textHash ?? null, label: file.name };
    });
  }

  return (
    <div className="space-y-3">
      <div role="tablist" className="inline-flex rounded-lg border border-line bg-paper-sunken p-1 text-sm">
        {(["file", "text"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => {
              setMode(option);
              setError(null);
            }}
            className={`rounded-md px-3 py-1 ${mode === option ? "bg-paper-raised font-medium shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {option === "file" ? "File" : "Paste text"}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line bg-paper-raised px-4 py-6 text-center text-sm hover:border-accent">
          <span className="font-medium">{busy ? busyLabel : "Choose a file to check"}</span>
          <span className="text-ink-muted">It&apos;s fingerprinted on your device and never uploaded.</span>
          <input
            type="file"
            className="sr-only"
            data-testid="verify-file"
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      ) : (
        <div className="space-y-3">
          <textarea
            aria-label="Text to check"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the text as published…"
            className={inputClass}
          />
          <Button
            variant="secondary"
            disabled={busy || !text.trim()}
            onClick={() =>
              run(async () => {
                const fp = await fingerprintPastedText(text);
                return { contentHash: fp.contentHash, textHash: fp.textHash ?? null, label: "Pasted text" };
              })
            }
          >
            {busy ? busyLabel : actionLabel}
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
