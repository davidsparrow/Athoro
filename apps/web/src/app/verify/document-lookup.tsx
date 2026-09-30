"use client";

import Link from "next/link";
import { useState } from "react";
import { DocumentInput } from "@/components/document-input";
import { formatDate } from "@/lib/format";
import { lookupFingerprintAction, type PublicMatch } from "./actions";

export function DocumentLookup() {
  const [result, setResult] = useState<{ label: string; matches: PublicMatch[] } | null>(null);

  return (
    <div className="space-y-4">
      <DocumentInput
        onFingerprint={async ({ contentHash, textHash, label }) => {
          setResult({ label, matches: await lookupFingerprintAction({ contentHash, textHash }) });
        }}
      />
      {result ? (
        <div role="status" className="rounded-xl border border-line bg-paper-raised p-5 text-sm">
          {result.matches.length ? (
            <>
              <p className="font-medium">
                <span className="text-accent">✓</span> {result.label} matches{" "}
                {result.matches.length === 1
                  ? "a registered record"
                  : `${result.matches.length} registered records`}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {result.matches.map((match) => (
                  <li key={match.proofId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span>
                      <span className="font-medium">{match.title}</span>
                      <span className="block text-ink-muted">
                        {match.authorDisplayName}
                        {match.registeredAt ? ` · registered ${formatDate(match.registeredAt)}` : ""} ·{" "}
                        {match.method === "exact-bytes" ? "identical file" : "same text"}
                      </span>
                    </span>
                    <Link
                      href={`/p/${match.proofId}`}
                      className="font-mono text-ink underline underline-offset-4"
                    >
                      {match.proofId}
                    </Link>
                  </li>
                ))}
              </ul>
              {result.matches.length > 1 ? (
                <p className="mt-2 text-ink-muted">
                  More than one record matches. Each shows who registered it and when; Authoro doesn&apos;t
                  decide between them.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-medium">No public record matches {result.label}</p>
              <p className="mt-1 text-ink-muted">
                Records match only the exact registered version. If the work was edited after registration,
                the author may have registered a newer version, or not registered it at all.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
