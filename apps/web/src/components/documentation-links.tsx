import type { ShownLink } from "@/lib/provenance";
import { ReportCheck } from "./report-check";

/**
 * Links a submitter gave to their own documentation, shown as theirs and
 * never as Authoro's finding. Authoro doesn't fetch or check what's there.
 */
export function DocumentationLinks({
  links,
  supplier,
  divided = true,
}: {
  links: ShownLink[];
  supplier: string;
  /** Set apart from content above with a rule. */
  divided?: boolean;
}) {
  if (!links.length) return null;
  return (
    <ul className={`space-y-3 text-sm ${divided ? "mt-4 border-t border-line pt-4" : "mt-3"}`}>
      {links.map((link) => (
        <li key={link.url} className="min-w-0">
          {link.label ? <p className="font-medium break-words">{link.label}</p> : null}
          <DocumentationLink link={link} />
          {link.reportHash ? <ReportCheck reportHash={link.reportHash} supplier={supplier} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** "Documentation hosted by <host> ↗", opening the submitter's site. */
export function DocumentationLink({ link, className = "" }: { link: ShownLink; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="nofollow ugc noopener"
      title={link.url}
      className={`text-ink-muted underline-offset-4 hover:text-ink hover:underline ${className}`}
    >
      Documentation hosted by{" "}
      <span className="whitespace-nowrap">
        <span className="text-ink">{link.host}</span> ↗
      </span>
    </a>
  );
}
