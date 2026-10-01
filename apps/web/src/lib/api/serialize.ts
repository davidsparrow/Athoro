import { hashCanonicalJson } from "@authoro/core";
import { embedSnippets } from "@/lib/embed";
import type { PublicProof } from "@/lib/proof";
import type { EvidenceSource } from "@/lib/provenance";
import { proofUrl } from "@/lib/urls";

type ProofEvent = PublicProof["events"][number];

/** Public details per event type, listed explicitly so private event data never leaks. */
function eventDetails(event: ProofEvent): Record<string, unknown> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  switch (event.eventType) {
    case "newer-version-registered":
      return { proofId: data.proofId ?? null, version: data.versionNumber ?? null };
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
    default:
      return {};
  }
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
 * with full payloads and hashes so anyone can re-verify them. Never includes
 * account IDs, typed-name salts or private metadata.
 */
export async function serializePublicProof(proof: PublicProof, origin: string) {
  const { record, version, work, author, evidence, authorAttestation, provenance, events } = proof;
  const url = proofUrl(record.publicId, origin);
  return {
    object: "proof",
    id: record.publicId,
    url,
    status: record.status,
    visibility: record.visibility,
    registeredAt: record.registeredAt?.toISOString() ?? null,
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
    evidence: await Promise.all(
      evidence.map(async (item) => ({
        id: item.id,
        class: item.evidenceClass,
        claimType: item.claimType,
        submittedBy: item.issuerId ? "issuer" : "author",
        status: item.status,
        signatureStatus: item.signatureStatus,
        addedVia: item.addedVia,
        createdAt: item.createdAt.toISOString(),
        approvedAt: item.addedVia === "api" ? (item.reviewedAt?.toISOString() ?? null) : null,
        revokedAt: item.revokedAt?.toISOString() ?? null,
        revocationNote: item.status === "revoked" ? item.revocationReason : null,
        payload: item.payload,
        payloadHash: item.payloadHash,
        intact: (await hashCanonicalJson(item.payload)) === item.payloadHash,
      })),
    ),
    versions: provenance.map(({ version: v, sources }) => ({
      id: v.proofId,
      number: v.versionNumber,
      status: v.status,
      registeredAt: v.registeredAt?.toISOString() ?? null,
      url: proofUrl(v.proofId, origin),
      sources: sources.map(serializeSource),
    })),
    events: events.map((event) => ({
      type: event.eventType,
      at: event.createdAt.toISOString(),
      ...eventDetails(event),
    })),
    mark: {
      svg: `${url}/mark.svg`,
      html: embedSnippets(record.publicId, origin).find((snippet) => snippet.id === "html")?.code ?? null,
    },
  };
}
