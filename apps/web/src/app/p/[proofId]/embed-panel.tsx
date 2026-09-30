"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { embedSnippets, type MarkTheme } from "@/lib/embed";

export function EmbedPanel({ proofId, origin }: { proofId: string; origin: string }) {
  const [theme, setTheme] = useState<MarkTheme>("light");
  const snippets = embedSnippets(proofId, origin, theme);
  const [active, setActive] = useState(snippets[0]!.id);
  const [copied, setCopied] = useState(false);
  const snippet = snippets.find((s) => s.id === active) ?? snippets[0]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`rounded-lg border border-line px-4 py-3 ${theme === "dark" ? "bg-[#111214]" : "bg-white"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the mark is the external SVG readers will see */}
          <img
            src={`/p/${proofId}/mark.svg${theme === "dark" ? "?theme=dark" : ""}`}
            alt="Authoro Mark preview"
            height={20}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={theme === "dark"}
            onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
            className="size-4 accent-[var(--accent)]"
          />
          For dark backgrounds
        </label>
      </div>
      <div role="tablist" className="flex flex-wrap gap-2 text-sm">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            onClick={() => {
              setActive(s.id);
              setCopied(false);
            }}
            className={`rounded-full border px-3 py-1 ${s.id === active ? "border-ink bg-ink text-paper" : "border-line text-ink-muted hover:text-ink"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-muted">{snippet.hint}</p>
      <pre className="overflow-x-auto rounded-lg border border-line bg-paper-sunken p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {snippet.code}
      </pre>
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(snippet.code);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
