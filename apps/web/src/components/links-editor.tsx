"use client";

import { abbreviateHash, MAX_LINK_LABEL_LENGTH, MAX_LINKS, type DocumentationLink } from "@authoro/core";
import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { formatBytes } from "@/lib/format";
import { hashReportFile, MAX_REPORT_BYTES } from "@/lib/report-hash";

export interface LinkDraft {
  url: string;
  label: string;
  reportHash: string | null;
  /** The file the report fingerprint came from, shown to the author only. */
  reportName: string | null;
}

export const emptyLink = (): LinkDraft => ({ url: "", label: "", reportHash: null, reportName: null });

/** The links to submit; rows without an address are left out. */
export function linksFromDrafts(drafts: LinkDraft[]): DocumentationLink[] {
  return drafts
    .filter((draft) => draft.url.trim())
    .map((draft) => ({
      url: draft.url.trim(),
      ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
      ...(draft.reportHash ? { reportHash: draft.reportHash } : {}),
    }));
}

/** Rewrites "links.1.url: …" validation errors as "Link 2: …". */
export function describeLinkError(error: string): string {
  return error.replace(
    /^(?:[\w.]*\.)?links\.(\d+)\.\w+: /,
    (_, index: string) => `Link ${Number(index) + 1}: `,
  );
}

/**
 * Edits up to five links to documentation. An exported report's fingerprint
 * is computed in the browser; the file itself is never uploaded.
 */
export function LinksEditor({
  links,
  onChange,
  idPrefix,
}: {
  links: LinkDraft[];
  onChange: (links: LinkDraft[]) => void;
  idPrefix: string;
}) {
  const [hashing, setHashing] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<LinkDraft>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  async function fingerprintReport(index: number, file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) {
      return setFileError(`Reports can be at most ${formatBytes(MAX_REPORT_BYTES)}.`);
    }
    setHashing(index);
    try {
      update(index, { reportHash: await hashReportFile(file), reportName: file.name });
    } catch {
      setFileError("Couldn't read that file. Try again.");
    } finally {
      setHashing(null);
    }
  }

  return (
    <div className="space-y-3">
      {links.map((link, index) => {
        const id = `${idPrefix}-${index}`;
        return (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-paper-raised p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Link {index + 1}</p>
              <button
                type="button"
                onClick={() => onChange(links.filter((_, i) => i !== index))}
                className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-url`} className="block text-sm text-ink-muted">
                Address
              </label>
              <input
                id={`${id}-url`}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={link.url}
                onChange={(event) => update(index, { url: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-label`} className="block text-sm text-ink-muted">
                Label <span className="text-ink-muted/80">(optional)</span>
              </label>
              <input
                id={`${id}-label`}
                maxLength={MAX_LINK_LABEL_LENGTH}
                placeholder="e.g. Revision history"
                value={link.label}
                onChange={(event) => update(index, { label: event.target.value })}
                className={inputClass}
              />
            </div>
            {link.reportHash ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                <span>
                  Report fingerprint{" "}
                  <code className="font-mono text-ink" title={link.reportHash}>
                    {abbreviateHash(link.reportHash, 8, 6)}
                  </code>
                  {link.reportName ? ` from ${link.reportName}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => update(index, { reportHash: null, reportName: null })}
                  className="underline underline-offset-4 hover:text-ink"
                >
                  Remove
                </button>
              </p>
            ) : (
              <div className="text-xs text-ink-muted">
                <label className="cursor-pointer text-ink underline underline-offset-4 hover:text-accent">
                  {hashing === index ? "Fingerprinting…" : "Add a report's fingerprint"}
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(event) => fingerprintReport(index, event.target.files?.[0])}
                  />
                </label>{" "}
                <span>
                  (optional). If readers can download a report from this link, choose your copy. Its
                  fingerprint lets them check theirs; the file isn&apos;t uploaded.
                </span>
              </div>
            )}
          </div>
        );
      })}
      {fileError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {fileError}
        </p>
      ) : null}
      {links.length < MAX_LINKS ? (
        <Button variant="secondary" className="h-9" onClick={() => onChange([...links, emptyLink()])}>
          {links.length ? "Add another link" : "Add a link"}
        </Button>
      ) : null}
    </div>
  );
}
