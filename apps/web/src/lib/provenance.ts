import { linkHost, type DocumentationLink, type EvidenceClass, type ProofEnvelope } from "@authoro/core";

/** A documentation link as readers see it: "Documentation hosted by <host>". */
export interface ShownLink extends DocumentationLink {
  host: string;
}

/** The stored evidence fields provenance is built from. */
export interface EvidenceRow {
  id: string;
  workVersionId: string;
  evidenceClass: EvidenceClass;
  claimType: string;
  payload: unknown;
  status: string;
  addedVia: "registration" | "author" | "api";
  createdAt: Date;
  reviewedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: string | null;
}

/** One piece of evidence, attributed to whoever supplied it. Never Authoro's own finding. */
export interface EvidenceSource {
  evidenceId: string;
  claimType: string;
  supplier: { kind: "author"; name: string } | { kind: "issuer"; name: string; issuerId: string };
  /** "Author supplied", or "Reported by <issuer>" for a Proof Envelope. */
  attribution: string;
  evidenceClass: EvidenceClass;
  addedVia: EvidenceRow["addedVia"];
  addedAt: Date;
  /** When the author approved evidence an integration submitted. */
  approvedAt: Date | null;
  status: string;
  revokedAt: Date | null;
  links: ShownLink[];
}

/**
 * The links a payload carries, keeping only well-formed https links so an
 * unexpected payload can never put another kind of URL in front of a reader.
 */
export function shownLinks(payload: unknown): ShownLink[] {
  const links = (payload as { links?: unknown } | null)?.links;
  if (!Array.isArray(links)) return [];
  return links.flatMap((link: DocumentationLink) => {
    const host = typeof link?.url === "string" ? linkHost(link.url) : "";
    return host ? [{ ...link, host }] : [];
  });
}

export function describeSource(item: EvidenceRow, authorName: string): EvidenceSource {
  const envelope = item.claimType === "proof-envelope" ? (item.payload as ProofEnvelope) : null;
  return {
    evidenceId: item.id,
    claimType: item.claimType,
    supplier: envelope
      ? { kind: "issuer", name: envelope.issuer.name, issuerId: envelope.issuer.id }
      : { kind: "author", name: authorName },
    attribution: envelope ? `Reported by ${envelope.issuer.name}` : "Author supplied",
    evidenceClass: item.evidenceClass,
    addedVia: item.addedVia,
    addedAt: item.createdAt,
    approvedAt: item.addedVia === "api" ? item.reviewedAt : null,
    status: item.status,
    revokedAt: item.revokedAt,
    links: shownLinks(item.payload),
  };
}

export interface VersionProvenance<V> {
  version: V;
  sources: EvidenceSource[];
}

/** Each version with the sources behind it, in version order. */
export function buildProvenance<
  V extends { workVersionId: string; versionNumber: number; authorDisplayName: string },
>(versions: V[], evidence: EvidenceRow[]): VersionProvenance<V>[] {
  return versions.map((version) => ({
    version,
    sources: evidence
      .filter((item) => item.workVersionId === version.workVersionId)
      .map((item) => describeSource(item, version.authorDisplayName)),
  }));
}
