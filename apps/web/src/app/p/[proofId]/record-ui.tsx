import type { ReactNode } from "react";
import { AuthoroMark } from "@/components/authoro-mark";

/** Building blocks shared by the record page, its sealed views and its evidence pages. */

export function humanize(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-8">
      <h2 className="mb-5 font-serif text-2xl tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "accent" }) {
  return (
    <li
      className={`rounded-full border px-3 py-1 ${tone === "accent" ? "border-accent/30 bg-accent-soft" : "border-line bg-paper-raised text-ink-muted"}`}
    >
      {children}
    </li>
  );
}

/** One check Authoro ran. `ok: null` is a check that doesn't apply yet, such as an unsigned envelope. */
export function Check({ ok, title, children }: { ok: boolean | null; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 w-3 shrink-0 font-medium ${ok === null ? "text-ink-muted" : ok ? "text-accent" : "text-red-700 dark:text-red-400"}`}
      >
        {ok === null ? "–" : ok ? "✓" : "✕"}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

export function Rows({ rows }: { rows: ([string, ReactNode] | null)[] }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {rows
        .filter((row): row is [string, ReactNode] => row !== null)
        .map(([label, value], index) => (
          <div key={`${label}-${index}`} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Hash({ value }: { value: string }) {
  return <code className="font-mono text-xs break-all">{value}</code>;
}

/** The record header's top line: the mark, what this is, and the ID. */
export function RecordKicker({ proofId, label = "Creation record" }: { proofId: string; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs tracking-wide text-ink-muted uppercase">
      <span className="flex items-center gap-2">
        <AuthoroMark size={16} /> {label}
      </span>
      <span className="font-mono normal-case">{proofId}</span>
    </div>
  );
}
