"use client";

import { compareFingerprints, MATCH_METHOD_DESCRIPTIONS, type MatchMethod } from "@authoro/core";
import Link from "next/link";
import { useState } from "react";
import { DocumentInput, type CandidateFingerprint } from "@/components/document-input";
import { recordVerificationAction } from "./actions";

interface VersionFingerprints {
  proofId: string;
  versionNumber: number;
  contentHash: string;
  textHash: string | null;
}

type Result =
  | { kind: "current"; method: MatchMethod; label: string }
  | { kind: "other"; method: MatchMethod; label: string; version: VersionFingerprints }
  | { kind: "none"; label: string };

/** Compares a reader's copy with this record entirely in the browser. */
export function VerifyCopy({ proofId, versions }: { proofId: string; versions: VersionFingerprints[] }) {
  const [result, setResult] = useState<Result | null>(null);
  const current = versions.find((version) => version.proofId === proofId);

  async function check(candidate: CandidateFingerprint) {
    const match = current ? compareFingerprints(current, candidate) : null;
    if (match?.matched) {
      setResult({ kind: "current", method: match.method, label: candidate.label });
    } else {
      const other = versions
        .filter((version) => version.proofId !== proofId)
        .map((version) => ({ version, match: compareFingerprints(version, candidate) }))
        .find(({ match }) => match.matched);
      setResult(
        other?.match.matched
          ? { kind: "other", method: other.match.method, label: candidate.label, version: other.version }
          : { kind: "none", label: candidate.label },
      );
    }
    void recordVerificationAction(proofId);
  }

  return (
    <div className="space-y-4">
      <DocumentInput onFingerprint={check} />
      {result ? (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${result.kind === "current" ? "border-accent/40 bg-accent-soft" : "border-line bg-paper-sunken"}`}
        >
          {result.kind === "current" ? (
            <>
              <p className="font-medium">
                <span className="text-accent">✓</span>{" "}
                {result.method === "exact-bytes" ? "Final artifact verified" : "Text matches this record"}
              </p>
              <p className="mt-1 text-ink-muted">
                {result.label}: {MATCH_METHOD_DESCRIPTIONS[result.method]}
              </p>
            </>
          ) : result.kind === "other" ? (
            <>
              <p className="font-medium">Matches a different version</p>
              <p className="mt-1 text-ink-muted">
                {result.label} matches{" "}
                <Link href={`/p/${result.version.proofId}`} className="text-ink underline underline-offset-4">
                  version {result.version.versionNumber}
                </Link>{" "}
                of this work, not this one.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No match</p>
              <p className="mt-1 text-ink-muted">
                {result.label} differs from the registered version. It may have been edited after
                registration, or it may be a different document.
                {current && !current.textHash
                  ? " This version was registered as a file without a text fingerprint, so only an exact copy of that file can match."
                  : ""}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
