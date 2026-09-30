import {
  AI_USES,
  CREATION_METHODS,
  EVIDENCE_CLASSES,
  hashCanonicalJson,
  parseProofId,
  TEXT_CANONICALIZATION,
  WORK_TYPES,
  abbreviateHash,
  type AiUse,
  type CreationMethod,
  type ProofEnvelope,
  type WorkType,
} from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { cache, type ReactNode } from "react";
import { AuthoroMark } from "@/components/authoro-mark";
import { db } from "@/db";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getMetricTotals, getPublicProof, incrementMetric, isLikelyBot } from "@/lib/proof";
import { getSession } from "@/lib/session";
import { appOrigin, displayUrl, proofUrl } from "@/lib/urls";
import { EmbedPanel } from "./embed-panel";
import { VerifyCopy } from "./verify-copy";

const loadProof = cache(async (proofId: string) => {
  const session = await getSession();
  return getPublicProof(db, proofId, session?.user.id);
});

export async function generateMetadata({ params }: PageProps<"/p/[proofId]">): Promise<Metadata> {
  const proofId = parseProofId(decodeURIComponent((await params).proofId));
  const proof = proofId ? await loadProof(proofId) : null;
  if (!proofId || proof?.kind !== "record") return { title: "Record not found" };
  const description = `Authoro creation record ${proofId} for “${proof.version.title}” by ${proof.author.displayName}: who attested to it, how it was made, and a way to check a copy.`;
  return {
    title: `${proof.version.title}: creation record`,
    description,
    alternates: { canonical: proofUrl(proofId) },
    robots: proof.record.visibility === "public" ? undefined : { index: false },
    openGraph: { title: `${proof.version.title} · Authoro record ${proofId}`, description, type: "article" },
  };
}

interface DisclosurePayload {
  methods: CreationMethod[];
  aiUses?: AiUse[];
  aiTools?: string[];
  note?: string;
}

export default async function ProofPage({ params, searchParams }: PageProps<"/p/[proofId]">) {
  const raw = decodeURIComponent((await params).proofId);
  const proofId = parseProofId(raw);
  if (!proofId) notFound();
  const { ref } = await searchParams;
  if (raw !== proofId) permanentRedirect(`/p/${proofId}${ref === "mark" ? "?ref=mark" : ""}`);

  const proof = await loadProof(proofId);
  if (!proof) notFound();
  if (proof.kind === "pending") redirect(`/attest/${proofId}`);

  const userAgent = (await headers()).get("user-agent");
  if (!proof.isOwner && !isLikelyBot(userAgent)) {
    after(async () => {
      await incrementMetric(db, proof.record.id, "pageViews").catch(() => {});
      if (ref === "mark") await incrementMetric(db, proof.record.id, "markClicks").catch(() => {});
    });
  }

  const { record, version, work, author, evidence, authorAttestation, versions } = proof;
  const disclosure = evidence.find((item) => item.claimType === "creation-disclosure");
  const envelopes = evidence.filter((item) => item.claimType === "proof-envelope");
  const disclosurePayload = disclosure?.payload as DisclosurePayload | undefined;
  const usedAi = disclosurePayload?.methods.some((m) => m === "ai-assisted" || m === "ai-generated-sections");

  // Recompute stored hashes so the page reports whether evidence is unchanged.
  const [attestationIntact, ...evidenceIntact] = await Promise.all([
    authorAttestation
      ? hashCanonicalJson(authorAttestation.payload).then(
          (hash) => hash === authorAttestation.attestationHash,
        )
      : Promise.resolve(false),
    ...evidence.map((item) => hashCanonicalJson(item.payload).then((hash) => hash === item.payloadHash)),
  ]);
  const allEvidenceIntact = evidenceIntact.every(Boolean);
  const metrics = proof.isOwner ? (await getMetricTotals(db, [record.id])).get(record.id) : undefined;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header>
        <div className="flex items-center justify-between gap-4 text-xs tracking-wide text-ink-muted uppercase">
          <span className="flex items-center gap-2">
            <AuthoroMark size={16} /> Creation record
          </span>
          <span className="font-mono normal-case">{proofId}</span>
        </div>
        <h1 className="mt-6 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{version.title}</h1>
        <p className="mt-4 text-ink-muted">
          <span className="text-ink">{author.displayName}</span> ·{" "}
          {WORK_TYPES[work.workType as WorkType] ?? work.workType} · Registered{" "}
          {record.registeredAt ? formatDate(record.registeredAt) : "—"}
        </p>
        {version.canonicalUrl ? (
          <p className="mt-2 text-sm">
            <a
              href={version.canonicalUrl}
              rel="nofollow ugc noopener"
              target="_blank"
              className="text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              {displayUrl(version.canonicalUrl)} ↗
            </a>
          </p>
        ) : null}
        {version.description ? <p className="mt-5 leading-relaxed">{version.description}</p> : null}
      </header>

      {record.status === "withdrawn" ? (
        <div role="status" className="mt-8 rounded-xl border border-caution/40 bg-caution-soft p-4 text-sm">
          <p className="font-medium">
            Withdrawn by the author{record.withdrawnAt ? ` on ${formatDate(record.withdrawnAt)}` : ""}
          </p>
          <p className="mt-1 text-ink-muted">
            The record stays visible so its history can still be checked.
            {record.withdrawnReason ? ` Reason given: ${record.withdrawnReason}` : ""}
          </p>
        </div>
      ) : null}

      <ul className="mt-8 flex flex-wrap gap-2 text-sm">
        {authorAttestation ? <Badge tone="accent">✓ Author attested</Badge> : null}
        <Badge tone="accent">✓ Fingerprint registered</Badge>
        {usedAi ? <Badge>AI use disclosed by author</Badge> : null}
        {envelopes.map((item) => (
          <Badge key={item.id}>Reported by {(item.payload as ProofEnvelope).issuer.name}</Badge>
        ))}
      </ul>

      <Section title="Integrity">
        <ul className="space-y-4">
          <Check ok title="Registered fingerprint recorded">
            Version {version.versionNumber} of this work has the fingerprint{" "}
            <code className="font-mono text-xs">{abbreviateHash(version.contentHash, 10, 6)}</code>
            {version.textHash
              ? " plus a text fingerprint, so copies pasted from the web can be checked too."
              : "."}
          </Check>
          {authorAttestation ? (
            <Check
              ok={attestationIntact}
              title={attestationIntact ? "Author attestation recorded" : "Attestation altered"}
            >
              {author.displayName} attested to this record on {formatDateTime(authorAttestation.signedAt)},
              from a signed-in Authoro account.
            </Check>
          ) : null}
          <Check
            ok={allEvidenceIntact}
            title={allEvidenceIntact ? "Evidence unchanged since submission" : "Evidence hash mismatch"}
          >
            Every claim below still matches the hash recorded when it was submitted.
          </Check>
        </ul>
        <div className="mt-8 rounded-xl border border-line bg-paper-raised p-5">
          <h3 className="font-medium">Check a copy</h3>
          <p className="mt-1 mb-4 text-sm text-ink-muted">
            Have the file, or the text as published? See whether it matches this record.
          </p>
          <VerifyCopy
            proofId={proofId}
            versions={versions.map(({ proofId: id, versionNumber, contentHash, textHash }) => ({
              proofId: id,
              versionNumber,
              contentHash,
              textHash,
            }))}
          />
        </div>
      </Section>

      <Section title="Evidence">
        <div className="space-y-4">
          {disclosurePayload && disclosure ? (
            <EvidenceCard
              title="How it was made"
              source={`Declared by ${author.displayName}`}
              label="Author supplied"
              revoked={disclosure.status === "revoked" ? disclosure.revokedAt : null}
            >
              <Rows
                rows={[
                  [
                    "Method",
                    disclosurePayload.methods.map((m) => CREATION_METHODS[m]?.label ?? m).join(", "),
                  ],
                  record.evidenceDisclosure !== "minimal" && disclosurePayload.aiUses?.length
                    ? ["AI helped with", disclosurePayload.aiUses.map((u) => AI_USES[u] ?? u).join(", ")]
                    : null,
                  record.evidenceDisclosure !== "minimal" && disclosurePayload.aiTools?.length
                    ? ["AI tools", disclosurePayload.aiTools.join(", ")]
                    : null,
                ]}
              />
              {disclosurePayload.note && record.evidenceDisclosure !== "minimal" ? (
                <blockquote className="mt-4 border-l-2 border-line pl-4 font-serif text-lg leading-relaxed">
                  {disclosurePayload.note}
                </blockquote>
              ) : null}
            </EvidenceCard>
          ) : null}

          {envelopes.map((item) => {
            const envelope = item.payload as ProofEnvelope;
            const { method } = envelope.evidence;
            const detailRows = Object.entries(envelope.evidence)
              .filter(
                ([key, value]) =>
                  key !== "class" &&
                  key !== "method" &&
                  ["string", "number", "boolean"].includes(typeof value),
              )
              .map(([key, value]): [string, ReactNode] => [
                humanize(key),
                typeof value === "number" ? formatNumber(value) : String(value),
              ]);
            return (
              <EvidenceCard
                key={item.id}
                title={`Reported by ${envelope.issuer.name}`}
                source={`${EVIDENCE_CLASSES[item.evidenceClass].label} · submitted by the author`}
                label={item.signatureStatus === "valid" ? "Signature verified" : "Unverified"}
                revoked={item.status === "revoked" ? item.revokedAt : null}
              >
                <Rows
                  rows={[
                    ["Method", humanize(method)],
                    envelope.timeline?.startedAt || envelope.timeline?.completedAt
                      ? [
                          "Period",
                          [envelope.timeline.startedAt, envelope.timeline.completedAt]
                            .filter(Boolean)
                            .map((t) => formatDate(t!))
                            .join(" – "),
                        ]
                      : null,
                    ...(record.evidenceDisclosure === "minimal" ? [] : detailRows),
                  ]}
                />
                <p className="mt-4 text-xs text-ink-muted">
                  {envelope.issuer.name}&apos;s signature{" "}
                  {item.signature ? "hasn't been verified yet" : "wasn't included"}. Authoro shows this as the
                  author submitted it.
                </p>
              </EvidenceCard>
            );
          })}
        </div>
      </Section>

      {versions.length > 1 ? (
        <Section title="Versions">
          <ol className="divide-y divide-line rounded-xl border border-line bg-paper-raised text-sm">
            {versions.map((v) => (
              <li key={v.proofId} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  Version {v.versionNumber}
                  {v.proofId === proofId ? <span className="ml-2 text-ink-muted">(this record)</span> : null}
                </span>
                <Link href={`/p/${v.proofId}`} className="font-mono text-ink-muted hover:text-ink">
                  {v.proofId}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="What this record means">
        <div className="space-y-3 leading-relaxed text-ink-muted">
          <p>
            This record shows that the claims above were made by the parties named, at the times shown, and
            haven&apos;t been altered since. Authoro checks fingerprints, hashes and who submitted each claim.
          </p>
          <p>
            It doesn&apos;t prove that every claim is true, and it doesn&apos;t judge whether a work is
            &ldquo;human&rdquo; or &ldquo;AI&rdquo;. Claims marked <em>Author supplied</em> are the
            author&apos;s own statements.
          </p>
        </div>
      </Section>

      <details className="mt-12 rounded-xl border border-line bg-paper-raised p-5 text-sm">
        <summary className="cursor-pointer font-medium">Technical details</summary>
        <div className="mt-4">
          <Rows
            rows={[
              [
                "Authoro ID",
                <code key="id" className="font-mono">
                  {proofId}
                </code>,
              ],
              [
                "Work ID",
                <code key="w" className="font-mono">
                  {work.publicId}
                </code>,
              ],
              ["Version", String(version.versionNumber)],
              ["Format", `${version.mediaType} · ${formatBytes(version.byteLength)}`],
              version.wordCount !== null ? ["Words", formatNumber(version.wordCount)] : null,
              ["Exact fingerprint", <Hash key="c" value={version.contentHash} />],
              version.textHash ? ["Text fingerprint", <Hash key="t" value={version.textHash} />] : null,
              version.textHash
                ? ["Canonicalization", version.textCanonicalization ?? TEXT_CANONICALIZATION]
                : null,
              authorAttestation
                ? ["Attestation hash", <Hash key="a" value={authorAttestation.attestationHash} />]
                : null,
              authorAttestation
                ? ["Statement", `Author attestation v${authorAttestation.statementVersion}`]
                : null,
              ...proof.events.map((event): [string, ReactNode] => [
                humanize(event.eventType),
                formatDateTime(event.createdAt),
              ]),
            ]}
          />
        </div>
      </details>

      {proof.isOwner ? (
        <section id="embed" className="mt-12 rounded-xl border border-accent/40 bg-paper-raised p-6">
          <p className="text-xs font-medium tracking-wide text-accent uppercase">Only you can see this</p>
          <h2 className="mt-2 font-serif text-2xl">Embed the Authoro Mark</h2>
          <p className="mt-1 mb-5 text-sm text-ink-muted">
            Put the mark beside your byline. Readers who click it land on this record.
          </p>
          <EmbedPanel proofId={proofId} origin={appOrigin()} />
          {metrics ? (
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-6 text-sm sm:grid-cols-4">
              <Stat label="Mark views" value={metrics.markImpressions} />
              <Stat label="Mark clicks" value={metrics.markClicks} />
              <Stat label="Record views" value={metrics.pageViews} />
              <Stat label="Copies checked" value={metrics.verifications} />
            </dl>
          ) : (
            <p className="mt-6 border-t border-line pt-6 text-sm text-ink-muted">
              Views and clicks from readers will appear here.
            </p>
          )}
        </section>
      ) : null}
    </article>
  );
}

function humanize(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-2xl tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "accent" }) {
  return (
    <li
      className={`rounded-full border px-3 py-1 ${tone === "accent" ? "border-accent/30 bg-accent-soft" : "border-line bg-paper-raised text-ink-muted"}`}
    >
      {children}
    </li>
  );
}

function Check({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 font-medium ${ok ? "text-accent" : "text-red-700 dark:text-red-400"}`}
      >
        {ok ? "✓" : "✕"}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

function EvidenceCard(props: {
  title: string;
  source: string;
  label: string;
  revoked: Date | null;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-paper-raised p-5 ${props.revoked ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`font-medium ${props.revoked ? "line-through" : ""}`}>{props.title}</h3>
          <p className="text-sm text-ink-muted">{props.source}</p>
        </div>
        <span className="rounded bg-caution-soft px-2 py-0.5 text-xs text-caution">
          {props.revoked ? `Revoked ${formatDate(props.revoked)}` : props.label}
        </span>
      </div>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

function Rows({ rows }: { rows: ([string, ReactNode] | null)[] }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {rows
        .filter((row): row is [string, ReactNode] => row !== null)
        .map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Hash({ value }: { value: string }) {
  return <code className="font-mono text-xs break-all">{value}</code>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl">{formatNumber(value)}</dd>
    </div>
  );
}
