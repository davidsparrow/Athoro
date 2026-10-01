import Link from "next/link";
import { DocumentationLink } from "@/components/documentation-links";
import { formatDate } from "@/lib/format";
import type { PublicProof } from "@/lib/proof";
import type { EvidenceSource } from "@/lib/provenance";

const CLAIM_LABELS: Record<string, string> = {
  "creation-disclosure": "how it was made",
  documentation: "documentation",
};

/**
 * Every version of the work with the sources behind it, oldest first: who
 * supplied each piece of evidence, when it was added if that was later, and
 * the documentation each source links to.
 */
export function ProvenanceHistory({
  provenance,
  currentProofId,
}: {
  provenance: PublicProof["provenance"];
  currentProofId: string;
}) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-paper-raised">
      {provenance.map(({ version, sources }) => {
        const current = version.proofId === currentProofId;
        return (
          <li key={version.proofId} className={`px-5 py-4 ${current ? "bg-paper-sunken/60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-medium">
                Version {version.versionNumber}
                {current ? <span className="ml-2 font-normal text-ink-muted">(this record)</span> : null}
              </p>
              <p className="text-sm text-ink-muted">
                <Link href={`/p/${version.proofId}`} className="font-mono hover:text-ink">
                  {version.proofId}
                </Link>
                {version.registeredAt ? ` · ${formatDate(version.registeredAt)}` : ""}
                {version.status === "withdrawn" ? " · withdrawn" : ""}
              </p>
            </div>
            <ul className="mt-3 space-y-2.5 text-sm">
              {sources.map((source) => (
                <SourceLine key={source.evidenceId} source={source} />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function SourceLine({ source }: { source: EvidenceSource }) {
  const revoked = source.status === "revoked";
  const what = CLAIM_LABELS[source.claimType];
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-[0.5rem] size-1 shrink-0 rounded-full bg-ink-muted" />
      <div className="min-w-0">
        <p className={revoked ? "text-ink-muted" : ""}>
          <span className={revoked ? "line-through" : ""}>
            <span className={revoked ? "" : "font-medium"}>{source.attribution}</span>
            {what ? <span className="text-ink-muted">: {what}</span> : null}
          </span>
          {source.addedVia !== "registration" ? (
            <span className="text-ink-muted"> · added {formatDate(source.approvedAt ?? source.addedAt)}</span>
          ) : null}
          {revoked ? <span className="text-ink-muted"> · revoked</span> : null}
        </p>
        {source.links.length && !revoked ? (
          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {source.links.map((link) => (
              <DocumentationLink key={link.url} link={link} />
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}
