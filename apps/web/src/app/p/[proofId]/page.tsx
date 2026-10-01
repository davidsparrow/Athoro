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
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { cache, type ReactNode } from "react";
import { DocumentationLinks } from "@/components/documentation-links";
import { buttonClass } from "@/components/ui";
import { db } from "@/db";
import { notifyEmbargoLifted } from "@/lib/email/notices";
import { getPlan } from "@/lib/entitlements";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getMetricTotals, getPublicProof, incrementMetric, isLikelyBot, type PublicProof } from "@/lib/proof";
import { describeSource, shownLinks } from "@/lib/provenance";
import { WITHDRAWAL_REASONS } from "@/lib/registration";
import { getSession } from "@/lib/session";
import { appOrigin, displayUrl, proofUrl } from "@/lib/urls";
import { EVIDENCE_PRESETS, VISIBILITIES, type EvidencePreset } from "@/lib/visibility-labels";
import { AddEvidenceForm } from "./add-evidence-form";
import { EmbedPanel } from "./embed-panel";
import { envelopeRows } from "./envelope-rows";
import { ProvenanceHistory } from "./provenance-history";
import { describeEvent } from "./record-history";
import { Badge, Check, Hash, RecordKicker, Rows, Section } from "./record-ui";
import { ReviewEvidence } from "./review-evidence";
import { RevokeEvidenceForm } from "./revoke-evidence-form";
import { SealedRecord } from "./sealed-record";
import { VerifyCopy } from "./verify-copy";
import { AccessForm, PresetForm } from "./visibility-forms";
import { WithdrawForm } from "./withdraw-form";

const loadProof = cache(async (proofId: string) => {
  const session = await getSession();
  return getPublicProof(db, proofId, session?.user.id);
});

export async function generateMetadata({ params }: PageProps<"/p/[proofId]">): Promise<Metadata> {
  const proofId = parseProofId(decodeURIComponent((await params).proofId));
  const proof = proofId ? await loadProof(proofId) : null;
  if (proofId && proof?.kind === "sealed") {
    return {
      title: `Authoro record ${proofId}`,
      description: `Authoro creation record ${proofId}. Its details aren't public.`,
      alternates: { canonical: proofUrl(proofId) },
      robots: { index: false },
    };
  }
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

  if (proof.kind === "sealed") return <SealedRecord proof={proof} />;

  const userAgent = (await headers()).get("user-agent");
  if (!proof.isOwner && !isLikelyBot(userAgent)) {
    after(async () => {
      await incrementMetric(db, proof.record.id, "pageViews").catch(() => {});
      if (ref === "mark") await incrementMetric(db, proof.record.id, "markClicks").catch(() => {});
    });
  }
  // This view released embargoes whose time had come; tell the author once.
  proof.released.forEach(notifyEmbargoLifted);

  const { record, version, work, author, evidence, authorAttestation, versions, pendingEvidence } = proof;
  // What the author attested to, and what was added to the record afterwards.
  const attested = evidence.filter((item) => item.addedVia === "registration");
  const addedLater = evidence.filter((item) => item.addedVia !== "registration");
  const disclosure = attested.find((item) => item.claimType === "creation-disclosure");
  const envelopes = attested.filter((item) => item.claimType === "proof-envelope");
  const reporters = [
    ...new Set(
      evidence
        .filter((item) => item.claimType === "proof-envelope" && item.status === "active")
        .map((item) => (item.payload as ProofEnvelope).issuer.name),
    ),
  ];
  const hasLinks = proof.provenance.some(({ sources }) => sources.some((source) => source.links.length));
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
  const canUsePro = proof.isOwner ? (await getPlan(db, work.ownerId)) === "pro" : false;
  const visibleProofIds = new Set(versions.map((v) => v.proofId));
  const preset = record.evidenceDisclosure;

  // Point older records at the newest registered version (or the newest at all, if every later one was withdrawn).
  const newer = versions.filter((v) => v.versionNumber > version.versionNumber);
  const newest = newer.findLast((v) => v.status === "registered") ?? newer.at(-1);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header>
        <RecordKicker proofId={proofId} />
        <h1 className="mt-6 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{version.title}</h1>
        <p className="mt-4 text-ink-muted">
          {author.isPublic ? (
            <Link href={`/a/${author.handle}`} className="text-ink underline-offset-4 hover:underline">
              {author.displayName}
            </Link>
          ) : (
            <span className="text-ink">{author.displayName}</span>
          )}{" "}
          · {WORK_TYPES[work.workType as WorkType] ?? work.workType} · Registered{" "}
          {record.registeredAt ? formatDate(record.registeredAt) : "—"}
          {record.visibility === "unlisted" ? " · Unlisted" : ""}
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

      {proof.isOwner && proof.access !== "full" ? (
        <div role="status" className="mt-8 rounded-xl border border-accent/40 bg-paper-raised p-4 text-sm">
          <p className="font-medium">Only you can see this record&apos;s details</p>
          <p className="mt-1 text-ink-muted">
            {proof.access === "embargoed"
              ? `Visitors see that a record exists, when it was registered and that it will be released on ${formatDateTime(record.embargoUntil!)}${record.embargoShowsFingerprint ? ", with its fingerprint" : ""}.`
              : proof.access === "restricted"
                ? "Visitors see that it was restricted, with its ID, dates, fingerprint and history."
                : "Visitors see only that a record exists for this ID."}{" "}
            <a href="#visibility" className="text-ink underline underline-offset-4">
              Change who can see it
            </a>
          </p>
        </div>
      ) : null}

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

      {newest ? (
        <div role="status" className="mt-8 rounded-xl border border-line bg-paper-sunken p-4 text-sm">
          <p className="font-medium">
            A newer version exists:{" "}
            <Link href={`/p/${newest.proofId}`} className="underline underline-offset-4">
              Version {newest.versionNumber} ({newest.proofId})
            </Link>
            {newest.status === "withdrawn" ? ", since withdrawn" : ""}
          </p>
          <p className="mt-1 text-ink-muted">
            This record still stands for version {version.versionNumber}, as registered
            {record.registeredAt ? ` on ${formatDate(record.registeredAt)}` : ""}.
          </p>
        </div>
      ) : null}

      {proof.isOwner && pendingEvidence.length ? (
        <section
          id="review"
          className="mt-8 scroll-mt-8 rounded-xl border border-accent/40 bg-paper-raised p-6"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">Only you can see this</p>
          <h2 className="mt-2 font-serif text-2xl">Waiting for your approval</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {pendingEvidence.length === 1 ? "This was" : "These were"} sent with one of your API keys.{" "}
            {record.status === "registered"
              ? "Nothing appears on the record until you approve it. Approved evidence is shown as added after your attestation; declining is final and nothing is shown."
              : "This record is withdrawn and final, so nothing more can be added to it. Decline to clear this list."}
          </p>
          <div className="mt-5 space-y-4">
            {pendingEvidence.map((item) => {
              const source = describeSource(item, author.displayName);
              const envelope = item.claimType === "proof-envelope" ? (item.payload as ProofEnvelope) : null;
              return (
                <div key={item.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">
                        {envelope ? source.attribution : "Links to documentation"}
                      </h3>
                      <p className="text-sm text-ink-muted">
                        Sent {formatDateTime(item.createdAt)}
                        {envelope
                          ? ` · ${EVIDENCE_CLASSES[item.evidenceClass].label}`
                          : " · would show as Author supplied"}
                      </p>
                    </div>
                    <span className="rounded bg-caution-soft px-2 py-0.5 text-xs text-caution">
                      Not public
                    </span>
                  </div>
                  {envelope ? <Rows rows={envelopeRows(envelope, "detailed")} /> : null}
                  <DocumentationLinks links={source.links} supplier={source.supplier.name} />
                  <ReviewEvidence
                    proofId={proofId}
                    evidenceId={item.id}
                    canApprove={record.status === "registered"}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <ul className="mt-8 flex flex-wrap gap-2 text-sm">
        {authorAttestation ? <Badge tone="accent">✓ Author attested</Badge> : null}
        <Badge tone="accent">✓ Fingerprint registered</Badge>
        {usedAi ? <Badge>AI use disclosed by author</Badge> : null}
        {reporters.map((name) => (
          <Badge key={name}>Reported by {name}</Badge>
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

      <Section title="Evidence" id="evidence">
        <div className="space-y-4">
          {disclosurePayload && disclosure ? (
            <EvidenceCard
              title="How it was made"
              source={`Declared by ${author.displayName}`}
              label="Author supplied"
              revoked={disclosure.status === "revoked" ? disclosure.revokedAt : null}
              sourceHref={`/p/${proofId}/evidence/${disclosure.id}`}
            >
              <Rows
                rows={[
                  [
                    "Method",
                    disclosurePayload.methods.map((m) => CREATION_METHODS[m]?.label ?? m).join(", "),
                  ],
                  preset !== "minimal" && disclosurePayload.aiUses?.length
                    ? ["AI helped with", disclosurePayload.aiUses.map((u) => AI_USES[u] ?? u).join(", ")]
                    : null,
                  preset !== "minimal" && disclosurePayload.aiTools?.length
                    ? ["AI tools", disclosurePayload.aiTools.join(", ")]
                    : null,
                ]}
              />
              {disclosurePayload.note && preset !== "minimal" ? (
                <blockquote className="mt-4 border-l-2 border-line pl-4 font-serif text-lg leading-relaxed">
                  {disclosurePayload.note}
                </blockquote>
              ) : null}
              <DocumentationLinks links={shownLinks(disclosure.payload)} supplier={author.displayName} />
            </EvidenceCard>
          ) : null}

          {envelopes.map((item) => (
            <EnvelopeCard
              key={item.id}
              item={item}
              preset={preset}
              proofId={proofId}
              source={`${EVIDENCE_CLASSES[item.evidenceClass].label} · submitted by the author`}
            />
          ))}
        </div>

        {addedLater.length ? (
          <div className="mt-10">
            <h3 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
              Added after registration
            </h3>
            <p className="mt-1 mb-4 text-sm text-ink-muted">
              These came after {author.displayName}&apos;s attestation and aren&apos;t part of it. Each shows
              when it was added.
            </p>
            <div className="space-y-4">
              {addedLater.map((item) => {
                const sent = formatDate(item.createdAt);
                const approved = item.reviewedAt ? formatDate(item.reviewedAt) : sent;
                const added =
                  item.addedVia !== "api"
                    ? `added by ${author.displayName} on ${sent}`
                    : sent === approved
                      ? `sent by an integration and approved by ${author.displayName} on ${sent}`
                      : `sent by an integration on ${sent} and approved by ${author.displayName} on ${approved}`;
                const revoke =
                  proof.isOwner && record.status === "registered" && item.status !== "revoked" ? (
                    <RevokeEvidenceForm proofId={proofId} evidenceId={item.id} />
                  ) : null;
                return item.claimType === "proof-envelope" ? (
                  <EnvelopeCard
                    key={item.id}
                    item={item}
                    preset={preset}
                    proofId={proofId}
                    source={`${EVIDENCE_CLASSES[item.evidenceClass].label} · ${added}`}
                    footer={revoke}
                  />
                ) : (
                  <EvidenceCard
                    key={item.id}
                    title="Documentation"
                    source={added.charAt(0).toUpperCase() + added.slice(1)}
                    label="Author supplied"
                    revoked={item.status === "revoked" ? item.revokedAt : null}
                    revocationNote={item.revocationReason}
                    sourceHref={`/p/${proofId}/evidence/${item.id}`}
                  >
                    <DocumentationLinks
                      links={shownLinks(item.payload)}
                      supplier={author.displayName}
                      divided={false}
                    />
                    {revoke}
                  </EvidenceCard>
                );
              })}
            </div>
          </div>
        ) : null}

        {preset === "minimal" ? (
          <p className="mt-6 text-xs leading-relaxed text-ink-muted">
            {author.displayName} chose Minimal evidence detail: the contents of their statements and of each
            Proof Envelope aren&apos;t shown, here or in the API. Who supplied each piece, its links and its
            hash checks stay visible.
          </p>
        ) : null}
        {hasLinks ? (
          <p className="mt-6 text-xs leading-relaxed text-ink-muted">
            Documentation links lead to the sites named, supplied by whoever submitted the evidence. Authoro
            doesn&apos;t host, fetch or check them. A report fingerprint lets you check that a copy you
            download is the one its submitter described.
          </p>
        ) : null}
      </Section>

      {versions.length > 1 ? (
        <Section title="Provenance history">
          <p className="-mt-2 mb-5 text-sm text-ink-muted">
            Every version of this work and who supplied evidence for it, oldest first.
          </p>
          <ProvenanceHistory provenance={proof.provenance} currentProofId={proofId} />
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
              ["Evidence detail", EVIDENCE_PRESETS[preset].label],
              ...proof.events.map((event) => describeEvent(event, visibleProofIds)),
            ]}
          />
          <p className="mt-4 text-xs text-ink-muted">
            Machine-readable:{" "}
            <a href={`/api/v1/proofs/${proofId}`} className="underline underline-offset-4 hover:text-ink">
              view this record as JSON
            </a>{" "}
            (Authoro API v1).
          </p>
        </div>
      </details>

      {proof.isOwner ? (
        <div className="mt-12 space-y-6">
          <section id="embed" className="rounded-xl border border-accent/40 bg-paper-raised p-6">
            <p className="text-xs font-medium tracking-wide text-accent uppercase">Only you can see this</p>
            <h2 className="mt-2 font-serif text-2xl">Embed the Authoro Mark</h2>
            {record.status === "withdrawn" ? (
              <p className="mt-1 text-sm text-ink-muted">
                This record is withdrawn, so its mark now says so wherever it&apos;s embedded.
              </p>
            ) : proof.access !== "full" ? (
              <p className="mt-1 text-sm text-ink-muted">
                While visitors can&apos;t see this record&apos;s details, its mark says{" "}
                {proof.access === "embargoed"
                  ? "“embargoed”"
                  : proof.access === "restricted"
                    ? "“restricted”"
                    : "“private”"}{" "}
                wherever it&apos;s embedded. Make the record public or unlisted to use the full mark.
              </p>
            ) : (
              <>
                <p className="mt-1 mb-5 text-sm text-ink-muted">
                  Put the mark beside your byline. Readers who click it land on this record.
                  {newest?.status === "registered"
                    ? ` To point readers at version ${newest.versionNumber}, embed its mark instead.`
                    : ""}
                </p>
                <EmbedPanel proofId={proofId} origin={appOrigin()} />
              </>
            )}
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

          <section id="manage" className="rounded-xl border border-line bg-paper-raised p-6">
            <p className="text-xs font-medium tracking-wide text-accent uppercase">Only you can see this</p>
            <h2 className="mt-2 font-serif text-2xl">Manage this work</h2>
            <div className="mt-5 divide-y divide-line">
              <div className="pb-6">
                <h3 className="font-medium">Register a new version</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Revised it? The new version gets its own ID and record. This record stays as it is and notes
                  that a newer version exists.
                </p>
                <Link href={`/register?work=${work.publicId}`} className={buttonClass("secondary", "mt-4")}>
                  Register a new version
                </Link>
              </div>
              {record.status === "registered" ? (
                <div id="visibility" className="scroll-mt-8 py-6">
                  <h3 className="font-medium">Who can see this record</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Now:{" "}
                    {proof.access === "restricted" ? "Restricted" : VISIBILITIES[record.visibility].label}
                    {proof.access === "embargoed"
                      ? `, released automatically on ${formatDateTime(record.embargoUntil!)}`
                      : ""}
                    . Every change is recorded in the record&apos;s public history. Making it public is always
                    free.
                  </p>
                  <AccessForm
                    proofId={proofId}
                    defaultVisibility={record.visibility}
                    defaultEmbargoUntil={record.embargoUntil?.toISOString() ?? null}
                    defaultShowFingerprint={record.embargoShowsFingerprint}
                    canUsePro={canUsePro}
                    publishedAt={record.publishedAt?.toISOString() ?? null}
                  />
                </div>
              ) : null}
              {record.status === "registered" ? (
                <div className="py-6">
                  <h3 className="font-medium">Evidence detail</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Now: {EVIDENCE_PRESETS[preset].label}. Changes are recorded in the record&apos;s public
                    history.
                  </p>
                  <PresetForm proofId={proofId} defaultPreset={preset} />
                </div>
              ) : null}
              {record.status === "registered" ? (
                <div className="py-6">
                  <h3 className="font-medium">Add documentation or evidence</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Link to documentation you&apos;ve published since, or attach a Proof Envelope from a
                    writing app, school or publisher. Each addition is dated and shown separately from what
                    you attested to.
                  </p>
                  <AddEvidenceForm proofId={proofId} />
                </div>
              ) : null}
              <div className="pt-6">
                <h3 className="font-medium">Withdraw this record</h3>
                {record.status === "registered" ? (
                  <>
                    <p className="mt-1 text-sm text-ink-muted">
                      Withdraw it if it was registered by mistake or its details are wrong. Nothing is
                      deleted: the record stays public with a withdrawn notice and your reason, and it
                      can&apos;t be undone.
                    </p>
                    <WithdrawForm proofId={proofId} reasons={Object.entries(WITHDRAWAL_REASONS)} />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">
                    Withdrawn{record.withdrawnAt ? ` on ${formatDate(record.withdrawnAt)}` : ""}. Withdrawal
                    is final.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function EvidenceCard(props: {
  title: string;
  source: string;
  label: string;
  revoked: Date | null;
  revocationNote?: string | null;
  /** Authoro's page for this evidence: `/p/<id>/evidence/<evidenceId>`. */
  sourceHref?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-paper-raised p-5 ${props.revoked ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`font-medium ${props.revoked ? "line-through" : ""}`}>{props.title}</h3>
          <p className="text-sm text-ink-muted">{props.source}</p>
        </div>
        <span className="shrink-0 rounded bg-caution-soft px-2 py-0.5 text-xs whitespace-nowrap text-caution">
          {props.revoked ? `Revoked ${formatDate(props.revoked)}` : props.label}
        </span>
      </div>
      {props.revoked ? (
        <p className="mt-2 text-sm text-ink-muted">
          Revoked by the author on {formatDate(props.revoked)}
          {props.revocationNote ? `: ${props.revocationNote}` : "."}
        </p>
      ) : null}
      <div className="mt-2">{props.children}</div>
      {props.sourceHref ? (
        <p className="mt-4 text-sm">
          <Link href={props.sourceHref as Route} className="font-medium underline-offset-4 hover:underline">
            View source evidence →
          </Link>
        </p>
      ) : null}
    </div>
  );
}

type EvidenceItem = PublicProof["evidence"][number];

/** A Proof Envelope, attributed to the organization it names. */
function EnvelopeCard({
  item,
  source,
  preset,
  proofId,
  footer,
}: {
  item: EvidenceItem;
  source: string;
  preset: EvidencePreset;
  proofId: string;
  footer?: ReactNode;
}) {
  const envelope = item.payload as ProofEnvelope;
  return (
    <EvidenceCard
      title={`Reported by ${envelope.issuer.name}`}
      source={source}
      label={item.signatureStatus === "valid" ? "✓ Signature valid" : "Unverified"}
      revoked={item.status === "revoked" ? item.revokedAt : null}
      revocationNote={item.revocationReason}
      sourceHref={`/p/${proofId}/evidence/${item.id}`}
    >
      <Rows rows={envelopeRows(envelope, preset)} />
      <DocumentationLinks links={shownLinks(envelope)} supplier={envelope.issuer.name} />
      <p className="mt-4 text-xs text-ink-muted">
        {envelope.issuer.name}&apos;s signature{" "}
        {item.signature ? "hasn't been verified yet" : "wasn't included"}. Authoro shows this as{" "}
        {item.addedVia === "api" ? "it was submitted" : "the author submitted it"}.
      </p>
      {footer}
    </EvidenceCard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl">{formatNumber(value)}</dd>
    </div>
  );
}
