import { abbreviateHash, TEXT_CANONICALIZATION } from "@authoro/core";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SealedProof } from "@/lib/proof";
import { describeEvent } from "./record-history";
import { Hash, RecordKicker, Rows, Section } from "./record-ui";
import { VerifyCopy } from "./verify-copy";

/**
 * What a visitor sees of a private record. Visibility can decrease disclosure,
 * but never erase provenance: a restricted record keeps its ID, timestamps,
 * fingerprint and history; an embargoed one says when it will be released.
 */
export function SealedRecord({ proof }: { proof: SealedProof }) {
  const { proofId, access, sealed } = proof;
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header>
        <RecordKicker proofId={proofId} />
        <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
          {access === "restricted"
            ? "This record was restricted by its owner"
            : "A provenance record exists for this Authoro ID"}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          {access === "private" || !sealed ? (
            "It is private. Only its owner can see the details."
          ) : access === "embargoed" ? (
            <>
              Its details are embargoed until{" "}
              <span className="text-ink">{formatDateTime(sealed.embargoUntil!)}</span>.
            </>
          ) : (
            <>
              It was previously {sealed.previousVisibility === "unlisted" ? "available by link" : "public"}{" "}
              and was restricted by its owner
              {sealed.restrictedAt ? ` on ${formatDate(sealed.restrictedAt)}` : ""}. Its details are hidden,
              but its provenance stays on the record.
            </>
          )}
        </p>
      </header>

      {sealed?.status === "withdrawn" ? (
        <div role="status" className="mt-8 rounded-xl border border-caution/40 bg-caution-soft p-4 text-sm">
          <p className="font-medium">
            Withdrawn by the author{sealed.withdrawnAt ? ` on ${formatDate(sealed.withdrawnAt)}` : ""}
          </p>
          {sealed.withdrawnReason ? (
            <p className="mt-1 text-ink-muted">Reason given: {sealed.withdrawnReason}</p>
          ) : null}
        </div>
      ) : null}

      {sealed ? (
        <Section title={access === "embargoed" ? "Before the release" : "What stays on the record"}>
          <div className="rounded-xl border border-line bg-paper-raised p-5">
            <Rows
              rows={[
                [
                  "Authoro ID",
                  <code key="id" className="font-mono">
                    {proofId}
                  </code>,
                ],
                ["Registered", formatDateTime(sealed.registeredAt)],
                access === "embargoed"
                  ? ["Release", `Automatic, ${formatDateTime(sealed.embargoUntil!)}`]
                  : [
                      sealed.previousVisibility === "unlisted" ? "Available by link" : "Public",
                      `From ${formatDateTime(sealed.publishedAt!)}${sealed.restrictedAt ? ` until ${formatDateTime(sealed.restrictedAt)}` : ""}`,
                    ],
                access === "embargoed"
                  ? [
                      "Third-party evidence",
                      sealed.issuerCount
                        ? `Reported by ${sealed.issuerCount} ${sealed.issuerCount === 1 ? "issuer" : "issuers"}, named at release`
                        : "None so far",
                    ]
                  : null,
                sealed.fingerprint ? ["Version", String(sealed.fingerprint.versionNumber)] : null,
                sealed.fingerprint
                  ? ["Exact fingerprint", <Hash key="c" value={sealed.fingerprint.contentHash} />]
                  : null,
                sealed.fingerprint?.textHash
                  ? ["Text fingerprint", <Hash key="t" value={sealed.fingerprint.textHash} />]
                  : null,
                sealed.fingerprint?.textHash
                  ? ["Canonicalization", sealed.fingerprint.textCanonicalization ?? TEXT_CANONICALIZATION]
                  : null,
                sealed.attestationHash
                  ? ["Attestation hash", <Hash key="a" value={sealed.attestationHash} />]
                  : null,
              ]}
            />
          </div>

          {sealed.fingerprint ? (
            <div className="mt-6 rounded-xl border border-line bg-paper-raised p-5">
              <h3 className="font-medium">Check a copy</h3>
              <p className="mt-1 mb-4 text-sm text-ink-muted">
                Have the file or its text? See whether it matches the fingerprint{" "}
                <code className="font-mono text-xs">
                  {abbreviateHash(sealed.fingerprint.contentHash, 10, 6)}
                </code>{" "}
                registered here. Your copy never leaves your browser.
              </p>
              <VerifyCopy
                proofId={proofId}
                versions={[
                  {
                    proofId,
                    versionNumber: sealed.fingerprint.versionNumber,
                    contentHash: sealed.fingerprint.contentHash,
                    textHash: sealed.fingerprint.textHash,
                  },
                ]}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {sealed?.events.length ? (
        <Section title="History">
          <div className="rounded-xl border border-line bg-paper-raised p-5">
            <Rows rows={sealed.events.map((event) => describeEvent(event))} />
          </div>
        </Section>
      ) : null}

      <Section title="What this means">
        <div className="space-y-3 leading-relaxed text-ink-muted">
          {access === "private" ? (
            <p>
              Authoro IDs are permanent. The owner of this one has kept its record private, so Authoro shows
              nothing about it beyond the fact that it exists. They may publish it later.
            </p>
          ) : access === "embargoed" ? (
            <>
              <p>
                Authoro recorded this registration on{" "}
                {sealed ? formatDate(sealed.registeredAt) : "the date shown"}. Its title, author and evidence
                stay sealed until the release, which happens automatically unless the owner moves or cancels
                it first. Any change to the schedule is recorded above.
              </p>
              <p>
                A registered version can&apos;t be altered, so the record released will describe the same
                document registered here. Anything added in the meantime is dated and shown separately.
              </p>
            </>
          ) : (
            <p>
              Authoro keeps a restricted record&apos;s ID, timestamps, fingerprint and history public, so a
              claim can&apos;t be published, relied on and then quietly erased. The author&apos;s statements
              and the evidence are hidden at their request; Authoro hasn&apos;t changed or deleted them.
            </p>
          )}
          <p>
            <Link href="/verify" className="text-ink underline underline-offset-4">
              Look up another record
            </Link>
          </p>
        </div>
      </Section>
    </article>
  );
}
