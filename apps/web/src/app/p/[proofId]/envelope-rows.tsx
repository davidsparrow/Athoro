import type { ProofEnvelope } from "@authoro/core";
import type { ReactNode } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import type { EvidencePreset } from "@/lib/visibility-labels";
import { humanize } from "./record-ui";

type Row = [string, ReactNode];

function scalar(value: unknown): string | null {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

/** Fields of an envelope's `evidence` object, flattened one level deep for the Detailed preset. */
function evidenceFields(evidence: Record<string, unknown>, nested: boolean): Row[] {
  return Object.entries(evidence)
    .filter(([key]) => key !== "class" && key !== "method")
    .flatMap(([key, value]): Row[] => {
      const shown = scalar(value);
      if (shown !== null) return [[humanize(key), shown]];
      if (!nested || value === null || typeof value !== "object") return [];
      if (Array.isArray(value)) {
        const items = value.map(scalar);
        return items.every((item) => item !== null) && items.length
          ? [[humanize(key), items.join(", ")]]
          : [];
      }
      return Object.entries(value as Record<string, unknown>).flatMap(([inner, innerValue]): Row[] => {
        const innerShown = scalar(innerValue);
        return innerShown !== null
          ? [[`${humanize(key)} · ${humanize(inner).toLowerCase()}`, innerShown]]
          : [];
      });
    });
}

/**
 * What a Proof Envelope's card shows under each evidence preset. Minimal keeps
 * the method and period; Standard adds the provider's top-level details;
 * Detailed adds nested statistics and the provider's identifiers.
 */
export function envelopeRows(envelope: ProofEnvelope, preset: EvidencePreset): (Row | null)[] {
  const { startedAt, completedAt } = envelope.timeline ?? {};
  const evidence = envelope.evidence as Record<string, unknown>;
  return [
    ["Method", humanize(envelope.evidence.method)],
    startedAt || completedAt
      ? [
          "Period",
          [startedAt, completedAt]
            .filter(Boolean)
            .map((t) => formatDate(t!))
            .join(" – "),
        ]
      : null,
    ...(preset === "minimal" ? [] : evidenceFields(evidence, preset === "detailed")),
    preset === "detailed"
      ? [
          "Issuer ID",
          <code key="issuer" className="font-mono text-xs">
            {envelope.issuer.id}
          </code>,
        ]
      : null,
    preset === "detailed" && envelope.work.title ? ["Work title given", envelope.work.title] : null,
    preset === "detailed" && envelope.author?.displayName
      ? ["Author named", envelope.author.displayName]
      : null,
  ];
}
