import {
  AI_USES,
  CREATION_METHODS,
  EVIDENCE_CLASSES,
  hashCanonicalJson,
  parseProofId,
  type AiUse,
  type CreationMethod,
  type ProofEnvelope,
} from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cache, type ReactNode } from "react";
import { DocumentationLinks } from "@/components/documentation-links";
import { db } from "@/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { getPublicProof } from "@/lib/proof";
import { describeSource } from "@/lib/provenance";
import { getSession } from "@/lib/session";
import { proofUrl } from "@/lib/urls";
import { EVIDENCE_PRESETS } from "@/lib/visibility-labels";
import { envelopeRows } from "../../envelope-rows";
import { Check, Hash, RecordKicker, Rows, Section } from "../../record-ui";
import { RecomputeHash } from "./recompute-hash";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const loadEvidence = cache(async (proofId: string, evidenceId: string) => {
  const session = await getSession();
  const proof = await getPublicProof(db, proofId, session?.user.id);
  if (proof?.kind !== "record") return { proof, item: null };
  return { proof, item: proof.evidence.find((item) => item.id === evidenceId) ?? null };
});

interface DisclosurePayload {
  schema?: string;
  methods: CreationMethod[];
  aiUses?: AiUse[];
  aiTools?: string[];
  note?: string;
}

function titleFor(claimType: string, payload: unknown): string {
  if (claimType === "proof-envelope") return `Reported by ${(payload as ProofEnvelope).issuer.name}`;
  return claimType === "creation-disclosure" ? "How it was made" : "Documentation";
}

export async function generateMetadata({
  params,
}: PageProps<"/p/[proofId]/evidence/[evidenceId]">): Promise<Metadata> {
  const { proofId: rawId, evidenceId } = await params;
  const proofId = parseProofId(decodeURIComponent(rawId));
  if (!proofId || !UUID.test(evidenceId)) return { title: "Evidence not found" };
  const { proof, item } = await loadEvidence(proofId, evidenceId);
  if (proof?.kind !== "record" || !item) return { title: "Evidence not found" };
  return {
    title: `${titleFor(item.claimType, item.payload)} · ${proofId}`,
    description: `Source evidence on Authoro record ${proofId} for “${proof.version.title}”: who supplied it, when, and whether it has changed since.`,
    alternates: { canonical: `${proofUrl(proofId)}/evidence/${item.id}` },
    robots: proof.record.visibility === "public" ? undefined : { index: false },
  };
}

/**
 * Authoro's page for one piece of evidence: who supplied it, when, the checks
 * Authoro runs on it and, as far as the record's evidence preset allows, its
 * contents. The supplier's own links are offered from here, never followed
 * automatically.
 */
export default async function EvidencePage({ params }: PageProps<"/p/[proofId]/evidence/[evidenceId]">) {
  const { proofId: rawId, evidenceId } = await params;
  const raw = decodeURIComponent(rawId);
  const proofId = parseProofId(raw);
  if (!proofId || !UUID.test(evidenceId)) notFound();
  if (raw !== proofId) permanentRedirect(`/p/${proofId}/evidence/${evidenceId}`);

  const { proof, item } = await loadEvidence(proofId, evidenceId);
  if (!proof) notFound();
  if (proof.kind === "pending") redirect(`/attest/${proofId}`);
  // A visitor to a private record sees its sealed notice, not its evidence.
  if (proof.kind === "sealed") redirect(`/p/${proofId}`);
  if (!item) notFound();

  const { record, version, author, authorAttestation } = proof;
  const preset = record.evidenceDisclosure;
  const source = describeSource(item, author.displayName);
  const envelope = item.claimType === "proof-envelope" ? (item.payload as ProofEnvelope) : null;
  const disclosure = item.claimType === "creation-disclosure" ? (item.payload as DisclosurePayload) : null;
  const schema = (item.payload as { schema?: unknown }).schema;
  const intact = (await hashCanonicalJson(item.payload)) === item.payloadHash;
  // The author's attestation records the disclosure's hash, binding the two together.
  const boundToAttestation =
    disclosure && item.addedVia === "registration"
      ? (authorAttestation?.payload as { disclosureHash?: string } | undefined)?.disclosureHash ===
        item.payloadHash
      : null;
  // Documentation links carry nothing a preset hides, so they're shown in full under every preset.
  const showsContents = preset !== "minimal" || (!envelope && !disclosure);

  const sent = formatDateTime(item.createdAt);
  const arrival =
    item.addedVia === "registration"
      ? `With the registration ${author.displayName} attested to, ${sent}`
      : item.addedVia === "author"
        ? `Added by ${author.displayName} after registration, ${sent}`
        : `Sent by an integration ${sent} and approved by ${author.displayName}${item.reviewedAt ? ` ${formatDateTime(item.reviewedAt)}` : ""}`;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header>
        <RecordKicker proofId={proofId} label="Source evidence" />
        <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
          {titleFor(item.claimType, item.payload)}
        </h1>
        <p className="mt-4 text-ink-muted">
          On the record for{" "}
          <Link href={`/p/${proofId}`} className="text-ink underline-offset-4 hover:underline">
            &ldquo;{version.title}&rdquo;
          </Link>{" "}
          by {author.displayName}, version {version.versionNumber}
        </p>
        <ul className="mt-6 flex flex-wrap gap-2 text-sm">
          <li className="rounded-full border border-line bg-paper-raised px-3 py-1 text-ink-muted">
            {source.attribution}
          </li>
          {item.status === "revoked" ? (
            <li className="rounded-full border border-caution/40 bg-caution-soft px-3 py-1 text-caution">
              Revoked {item.revokedAt ? formatDate(item.revokedAt) : ""}
            </li>
          ) : null}
        </ul>
      </header>

      {item.status === "revoked" ? (
        <div role="status" className="mt-8 rounded-xl border border-caution/40 bg-caution-soft p-4 text-sm">
          <p className="font-medium">
            Revoked by {author.displayName}
            {item.revokedAt ? ` on ${formatDate(item.revokedAt)}` : ""}
          </p>
          <p className="mt-1 text-ink-muted">
            It stays listed so the record&apos;s history can still be checked.
            {item.revocationReason ? ` Note: ${item.revocationReason}` : ""}
          </p>
        </div>
      ) : null}

      <Section title="About this evidence">
        <div className="rounded-xl border border-line bg-paper-raised p-5">
          <Rows
            rows={[
              [
                "Claim",
                envelope
                  ? EVIDENCE_CLASSES[item.evidenceClass].label
                  : titleFor(item.claimType, item.payload),
              ],
              [
                "Supplied by",
                envelope ? (
                  <>
                    {envelope.issuer.name}{" "}
                    <span className="text-ink-muted">
                      (issuer ID <code className="font-mono text-xs">{envelope.issuer.id}</code>, as the
                      envelope names it)
                    </span>
                  </>
                ) : (
                  `${author.displayName} (Author supplied)`
                ),
              ],
              ["Arrived", arrival],
              typeof schema === "string"
                ? [
                    "Schema",
                    <code key="s" className="font-mono text-xs">
                      {schema}
                    </code>,
                  ]
                : null,
              ["Evidence hash", <Hash key="h" value={item.payloadHash} />],
              ["Evidence detail", `${EVIDENCE_PRESETS[preset].label}, chosen by ${author.displayName}`],
            ]}
          />
        </div>
      </Section>

      <Section title="Checks">
        <ul className="space-y-4">
          <Check ok={intact} title={intact ? "Unchanged since submission" : "Evidence hash mismatch"}>
            Authoro recomputed this evidence&apos;s hash just now (SHA-256 of its canonical JSON) and compared
            it with the hash recorded on {formatDate(item.createdAt)}.
          </Check>
          {envelope ? (
            <Check
              ok={item.signatureStatus === "valid" ? true : item.signatureStatus === "invalid" ? false : null}
              title={
                item.signatureStatus === "valid"
                  ? "Signature valid"
                  : item.signatureStatus === "invalid"
                    ? "Signature invalid"
                    : "Unverified"
              }
            >
              {item.signatureStatus === "valid"
                ? `${envelope.issuer.name}'s signature matches its registered key.`
                : item.signature
                  ? `${envelope.issuer.name} signed it, but Authoro can't check issuer signatures until issuer keys arrive.`
                  : `${envelope.issuer.name} didn't sign it, so it rests on ${item.addedVia === "api" ? "the integration that sent it" : `${author.displayName}, who submitted it`}.`}
            </Check>
          ) : null}
          {boundToAttestation !== null ? (
            <Check
              ok={boundToAttestation}
              title={
                boundToAttestation ? "Covered by the author's attestation" : "Not matched to the attestation"
              }
            >
              {author.displayName}&apos;s attestation records this disclosure&apos;s hash, so neither can
              change without the other failing its check.
            </Check>
          ) : null}
        </ul>
      </Section>

      <Section title="Contents">
        {showsContents ? (
          <>
            {envelope ? <Rows rows={envelopeRows(envelope, "detailed")} /> : null}
            {disclosure ? <DisclosureRows disclosure={disclosure} /> : null}
            <details className="mt-6 rounded-xl border border-line bg-paper-raised p-5 text-sm">
              <summary className="cursor-pointer font-medium">The evidence as submitted (JSON)</summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-paper-sunken p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
              <RecomputeHash payload={item.payload} expected={item.payloadHash} />
            </details>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-muted">
              {author.displayName} chose Minimal evidence detail for this record, so this evidence&apos;s
              contents aren&apos;t shown, here or in the API. Its hash above still shows it hasn&apos;t
              changed since it was submitted.
            </p>
            {envelope ? <Rows rows={envelopeRows(envelope, "minimal")} /> : null}
            {disclosure ? (
              <Rows
                rows={[["Method", disclosure.methods.map((m) => CREATION_METHODS[m]?.label ?? m).join(", ")]]}
              />
            ) : null}
          </>
        )}
      </Section>

      {source.links.length ? (
        <Section title={`From ${source.supplier.name}`}>
          <p className="-mt-2 text-sm text-ink-muted">
            Links {source.supplier.name} gave to their own documentation. Authoro doesn&apos;t host, fetch or
            check them.
          </p>
          <DocumentationLinks links={source.links} supplier={source.supplier.name} />
        </Section>
      ) : null}

      <p className="mt-12 text-sm leading-relaxed text-ink-muted">
        Authoro shows this evidence as it was submitted and checks that it hasn&apos;t changed. It
        doesn&apos;t confirm the claim itself: {envelope ? envelope.issuer.name : author.displayName} is
        responsible for what it says.{" "}
        <a href={`/api/v1/proofs/${proofId}`} className="underline underline-offset-4 hover:text-ink">
          The record as JSON
        </a>{" "}
        ·{" "}
        <Link href={`/p/${proofId}`} className="underline underline-offset-4 hover:text-ink">
          Back to the record
        </Link>
      </p>
    </article>
  );
}

function DisclosureRows({ disclosure }: { disclosure: DisclosurePayload }): ReactNode {
  return (
    <>
      <Rows
        rows={[
          ["Method", disclosure.methods.map((m) => CREATION_METHODS[m]?.label ?? m).join(", ")],
          disclosure.aiUses?.length
            ? ["AI helped with", disclosure.aiUses.map((u) => AI_USES[u] ?? u).join(", ")]
            : null,
          disclosure.aiTools?.length ? ["AI tools", disclosure.aiTools.join(", ")] : null,
        ]}
      />
      {disclosure.note ? (
        <blockquote className="mt-4 border-l-2 border-line pl-4 font-serif text-lg leading-relaxed">
          {disclosure.note}
        </blockquote>
      ) : null}
    </>
  );
}
