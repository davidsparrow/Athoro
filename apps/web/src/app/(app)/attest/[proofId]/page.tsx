import {
  EVIDENCE_CLASSES,
  parseProofId,
  WORK_TYPES,
  type CreationDisclosure,
  type ProofEnvelope,
  type WorkType,
} from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, Card, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { describeDisclosure } from "@/lib/disclosure";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { getOwnedRegistration } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";
import { AttestForm } from "./attest-form";

export const metadata: Metadata = { title: "Attest and register" };

export default async function AttestPage({ params }: PageProps<"/attest/[proofId]">) {
  const { proofId: rawId } = await params;
  const proofId = parseProofId(decodeURIComponent(rawId));
  if (!proofId) notFound();
  const { session, profile } = await requireAuthor(`/attest/${proofId}`);
  const registration = await getOwnedRegistration(db, proofId, session.user.id);
  if (!registration) notFound();

  const { record, version, work, evidence } = registration;
  const disclosure = evidence.find((item) => item.claimType === "creation-disclosure");
  const envelopes = evidence.filter((item) => item.claimType === "proof-envelope");
  const described = disclosure ? describeDisclosure(disclosure.payload as CreationDisclosure) : null;

  if (record.status !== "pending_attestation") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <Alert tone="success">
          <span className="font-mono">{proofId}</span> was registered
          {record.registeredAt ? ` on ${formatDate(record.registeredAt)}` : ""}.
        </Alert>
        <Link href="/dashboard" className={`${buttonClass("secondary")} mt-6`}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">
        Final step · Author attestation
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight">Confirm and register</h1>
      <p className="mt-3 leading-relaxed text-ink-muted">
        Check what will appear on the public record for <span className="font-mono text-ink">{proofId}</span>.
        Only you can complete this step; apps and AI agents can prepare a registration, but never attest for
        you.
      </p>

      <div className="mt-10 space-y-6">
        <Card>
          <h2 className="font-medium">The work</h2>
          <Rows
            rows={[
              ["Title", version.title],
              ["Byline", version.authorDisplayName],
              ["Type", WORK_TYPES[work.workType as WorkType] ?? work.workType],
              ["Published at", version.canonicalUrl ?? "Not given"],
              ["Description", version.description],
            ]}
          />
        </Card>

        <Card>
          <h2 className="font-medium">Fingerprint</h2>
          <Rows
            rows={[
              ["Format", `${version.mediaType} · ${formatBytes(version.byteLength)}`],
              ["Words", version.wordCount !== null ? formatNumber(version.wordCount) : null],
              [
                "Exact",
                <code key="c" className="font-mono text-xs break-all">
                  {version.contentHash}
                </code>,
              ],
              [
                "Text",
                version.textHash ? (
                  <code key="t" className="font-mono text-xs break-all">
                    {version.textHash}
                  </code>
                ) : null,
              ],
            ]}
          />
        </Card>

        {described ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">How it was made</h2>
              <span className="rounded bg-caution-soft px-2 py-0.5 text-xs text-caution">
                Author supplied
              </span>
            </div>
            <Rows
              rows={[
                ["Method", described.methods.join(", ")],
                ["AI helped with", described.aiUses.join(", ") || null],
                ["AI tools", described.aiTools.join(", ") || null],
                ["Note", described.note],
              ]}
            />
          </Card>
        ) : null}

        {envelopes.map((item) => {
          const envelope = item.payload as ProofEnvelope;
          return (
            <Card key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium">Reported by {envelope.issuer.name}</h2>
                <span className="rounded bg-caution-soft px-2 py-0.5 text-xs text-caution">
                  Submitted by you · unverified
                </span>
              </div>
              <Rows
                rows={[
                  ["Evidence", EVIDENCE_CLASSES[item.evidenceClass].label],
                  ["Method", envelope.evidence.method],
                  ["Signature", item.signatureStatus === "unsigned" ? "None" : "Present, not yet verifiable"],
                ]}
              />
            </Card>
          );
        })}

        <Card className="border-ink/20">
          <h2 className="font-medium">Attestation</h2>
          <div className="mt-5">
            <AttestForm proofId={proofId} byline={profile.displayName} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-4 space-y-3 text-sm">
      {rows
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
