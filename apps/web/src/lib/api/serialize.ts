import { hashCanonicalJson, type ProofEnvelope } from "@authoro/core";
import { embedSnippets } from "@/lib/embed";
import type { PublicProof, SealedProof } from "@/lib/proof";
import type { EvidenceSource } from "@/lib/provenance";
import { proofUrl } from "@/lib/urls";
import type { EvidencePreset } from "@/lib/visibility-labels";

type ProofEvent = PublicProof["events"][number];
type EvidenceItem = PublicProof["evidence"][number];

/**
 * Public details per event type, listed explicitly so private event data never
 * leaks. A newer version's ID is given only when the reader may see it.
 */
function eventDetails(event: ProofEvent, visibleProofIds: ReadonlySet<string>): Record<string, unknown> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  switch (event.eventType) {
    case "registered":
      return { visibility: data.visibility ?? null, embargoUntil: data.embargoUntil ?? null };
    case "newer-version-registered":
      return {
        proofId: typeof data.proofId === "string" && visibleProofIds.has(data.proofId) ? data.proofId : null,
        version: data.versionNumber ?? null,
      };
    case "withdrawn":
      return { reason: data.reason ?? null, note: data.note ?? null };
    case "evidence-added":
      return {
        evidenceId: data.evidenceId ?? null,
        claimType: data.claimType ?? null,
        via: data.via ?? null,
      };
    case "evidence-revoked":
      return {
        evidenceId: data.evidenceId ?? null,
        claimType: data.claimType ?? null,
        note: data.note ?? null,
      };
    case "visibility-changed":
      return { from: data.from ?? null, to: data.to ?? null, firstPublished: data.firstPublished === true };
    case "embargo-changed":
      return {
        from: data.from ?? null,
        to: data.to ?? null,
        fingerprintShown: data.fingerprintShown === true,
      };
    case "embargo-lifted":
      return { scheduledFor: data.scheduledFor ?? null, early: data.early === true, to: data.to ?? null };
    case "evidence-disclosure-changed":
      return { from: data.from ?? null, to: data.to ?? null };
    default:
      return {};
  }
}

function serializeEvents(events: ProofEvent[], visibleProofIds: ReadonlySet<string> = new Set()) {
  return events.map((event) => ({
    type: event.eventType,
    at: event.createdAt.toISOString(),
    ...eventDetails(event, visibleProofIds),
  }));
}

/**
 * The fields of an evidence payload that stay public under the Minimal preset:
 * who reported it, what kind of claim it is, its schema and its links. Minimal
 * hides content, not verifiability, so the hash of the full payload is still
 * returned. Documentation links carry nothing to hide and stay whole.
 */
function minimalFields(item: EvidenceItem): Record<string, unknown> | null {
  const payload = item.payload as Record<string, unknown>;
  if (item.claimType === "proof-envelope") {
    const envelope = payload as ProofEnvelope;
    return {
      schema: envelope.schema,
      issuer: envelope.issuer,
      evidence: { class: envelope.evidence.class ?? null, method: envelope.evidence.method },
      timeline: envelope.timeline ?? null,
      links: envelope.links ?? [],
    };
  }
  if (item.claimType === "creation-disclosure") {
    return { schema: payload.schema ?? null, methods: payload.methods ?? [], links: payload.links ?? [] };
  }
  return null;
}

async function serializeEvidence(item: EvidenceItem, preset: EvidencePreset) {
  const publicFields = preset === "minimal" ? minimalFields(item) : null;
  return {
    id: item.id,
    class: item.evidenceClass,
    claimType: item.claimType,
    submittedBy: item.issuerId ? "issuer" : "author",
    status: item.status,
    signatureStatus: item.signatureStatus,
    signed: Boolean(item.signature),
    addedVia: item.addedVia,
    createdAt: item.createdAt.toISOString(),
    approvedAt: item.addedVia === "api" ? (item.reviewedAt?.toISOString() ?? null) : null,
    revokedAt: item.revokedAt?.toISOString() ?? null,
    revocationNote: item.status === "revoked" ? item.revocationReason : null,
    /** Withheld under the Minimal preset; `publicFields` then lists what stays public. */
    payload: publicFields ? null : item.payload,
    payloadWithheld: Boolean(publicFields),
    ...(publicFields ? { publicFields } : {}),
    payloadHash: item.payloadHash,
    intact: (await hashCanonicalJson(item.payload)) === item.payloadHash,
  };
}

/** One version's source of evidence, attributed to whoever supplied it. */
function serializeSource(source: EvidenceSource) {
  return {
    evidenceId: source.evidenceId,
    claimType: source.claimType,
    attribution: source.attribution,
    supplier:
      source.supplier.kind === "issuer"
        ? { type: "issuer", name: source.supplier.name, id: source.supplier.issuerId }
        : { type: "author", name: source.supplier.name },
    class: source.evidenceClass,
    addedVia: source.addedVia,
    addedAt: source.addedAt.toISOString(),
    approvedAt: source.approvedAt?.toISOString() ?? null,
    status: source.status,
    revokedAt: source.revokedAt?.toISOString() ?? null,
    links: source.links.map((link) => ({
      url: link.url,
      host: link.host,
      label: link.label ?? null,
      reportHash: link.reportHash ?? null,
    })),
  };
}

/**
 * The public JSON form of a proof record: everything the proof page shows,
 * with payloads and hashes so anyone can re-verify them. Under the Minimal
 * preset, payload bodies are withheld but their hashes and verification
 * fields stay. Never includes account IDs, typed-name salts or private metadata.
 */
export async function serializePublicProof(proof: PublicProof, origin: string) {
  const { record, version, work, author, evidence, authorAttestation, provenance, events } = proof;
  const url = proofUrl(record.publicId, origin);
  const visibleProofIds = new Set(proof.versions.map((v) => v.proofId));
  return {
    object: "proof",
    id: record.publicId,
    url,
    access: "full",
    status: record.status,
    visibility: record.visibility,
    evidenceDisclosure: record.evidenceDisclosure,
    registeredAt: record.registeredAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    withdrawn:
      record.status === "withdrawn"
        ? { at: record.withdrawnAt?.toISOString() ?? null, reason: record.withdrawnReason }
        : null,
    work: {
      id: work.publicId,
      title: version.title,
      type: work.workType,
      canonicalUrl: version.canonicalUrl,
      description: version.description,
    },
    author: { displayName: author.displayName, handle: author.isPublic ? author.handle : null },
    version: {
      number: version.versionNumber,
      contentHash: version.contentHash,
      textHash: version.textHash,
      textCanonicalization: version.textCanonicalization,
      mediaType: version.mediaType,
      byteLength: version.byteLength,
      wordCount: version.wordCount,
    },
    authorAttestation: authorAttestation
      ? {
          statementVersion: authorAttestation.statementVersion,
          signedAt: authorAttestation.signedAt.toISOString(),
          attestationHash: authorAttestation.attestationHash,
          payload: authorAttestation.payload,
          intact: (await hashCanonicalJson(authorAttestation.payload)) === authorAttestation.attestationHash,
        }
      : null,
    evidence: await Promise.all(evidence.map((item) => serializeEvidence(item, record.evidenceDisclosure))),
    versions: provenance.map(({ version: v, sources }) => ({
      id: v.proofId,
      number: v.versionNumber,
      status: v.status,
      registeredAt: v.registeredAt?.toISOString() ?? null,
      url: proofUrl(v.proofId, origin),
      sources: sources.map(serializeSource),
    })),
    events: serializeEvents(events, visibleProofIds),
    mark: {
      svg: `${url}/mark.svg`,
      html: embedSnippets(record.publicId, origin).find((snippet) => snippet.id === "html")?.code ?? null,
    },
  };
}

/**
 * The JSON form of a record whose details aren't public: only that a private
 * record exists; an embargoed record's registration time, release time, issuer
 * count and (if the author allows) fingerprint; or a restricted record's
 * surviving provenance: its dates, fingerprint, attestation hash and history.
 */
export function serializeSealedProof(proof: SealedProof, origin: string) {
  const url = proofUrl(proof.proofId, origin);
  const base = { object: "proof", id: proof.proofId, url, access: proof.access, visibility: "private" };
  const { sealed } = proof;
  if (!sealed) return base;
  const fingerprint = sealed.fingerprint
    ? {
        number: sealed.fingerprint.versionNumber,
        contentHash: sealed.fingerprint.contentHash,
        textHash: sealed.fingerprint.textHash,
        textCanonicalization: sealed.fingerprint.textCanonicalization,
      }
    : null;
  if (proof.access === "embargoed") {
    return {
      ...base,
      status: sealed.status,
      registeredAt: sealed.registeredAt.toISOString(),
      embargo: { until: sealed.embargoUntil?.toISOString() ?? null, issuerCount: sealed.issuerCount ?? 0 },
      version: fingerprint,
      events: serializeEvents(sealed.events),
    };
  }
  return {
    ...base,
    status: sealed.status,
    registeredAt: sealed.registeredAt.toISOString(),
    publishedAt: sealed.publishedAt?.toISOString() ?? null,
    restrictedAt: sealed.restrictedAt?.toISOString() ?? null,
    withdrawn:
      sealed.status === "withdrawn"
        ? { at: sealed.withdrawnAt?.toISOString() ?? null, reason: sealed.withdrawnReason }
        : null,
    version: fingerprint,
    attestationHash: sealed.attestationHash,
    events: serializeEvents(sealed.events),
    mark: { svg: `${url}/mark.svg` },
  };
}
