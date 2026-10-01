import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { isWithdrawalReason, WITHDRAWAL_REASONS } from "@/lib/registration";
import { EVIDENCE_PRESETS, isEvidencePreset } from "@/lib/visibility";
import { humanize } from "./record-ui";

export interface HistoryEvent {
  eventType: string;
  data: unknown;
  createdAt: Date;
}

const VISIBILITY_WORDS: Record<string, string> = {
  public: "public",
  unlisted: "unlisted (available by link)",
  private: "private",
};

function when(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDateTime(date);
}

function presetLabel(value: unknown): string {
  return isEvidencePreset(value) ? EVIDENCE_PRESETS[value].label : "an earlier setting";
}

/**
 * A plain-English line for each entry in a record's history. `visibleProofIds`
 * are the versions this viewer may see; other versions are mentioned without
 * their ID, so an unlisted or private version isn't listed.
 */
export function describeEvent(
  event: HistoryEvent,
  visibleProofIds: ReadonlySet<string> = new Set(),
): [string, ReactNode] {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const at = formatDateTime(event.createdAt);
  switch (event.eventType) {
    case "registered": {
      const embargo = when(data.embargoUntil);
      const detail =
        data.visibility === "private"
          ? embargo
            ? `, embargoed until ${embargo}`
            : ", as a private record"
          : data.visibility === "unlisted"
            ? ", unlisted"
            : "";
      return ["Registered", `${at}${detail}`];
    }
    case "newer-version-registered": {
      const newerId = typeof data.proofId === "string" ? data.proofId : null;
      return [
        "Newer version",
        <>
          Version {String(data.versionNumber ?? "")} registered
          {newerId && visibleProofIds.has(newerId) ? (
            <>
              {" "}
              as{" "}
              <Link href={`/p/${newerId}`} className="font-mono underline underline-offset-4">
                {newerId}
              </Link>
            </>
          ) : null}
          , {at}
        </>,
      ];
    }
    case "evidence-added":
      return [
        "Evidence added",
        `${data.claimType === "proof-envelope" ? "A Proof Envelope" : "Documentation links"}${data.via === "api" ? ", sent by an integration and approved by the author" : ", by the author"}, ${at}`,
      ];
    case "evidence-revoked":
      return [
        "Evidence revoked",
        `${data.claimType === "proof-envelope" ? "A Proof Envelope" : "Documentation links"}, by the author, ${at}${typeof data.note === "string" && data.note ? `. Note: ${data.note}` : ""}`,
      ];
    case "withdrawn":
      return [
        "Withdrawn",
        `By the author, ${at}${isWithdrawalReason(data.reason) ? `. Reason: ${WITHDRAWAL_REASONS[data.reason]}` : ""}`,
      ];
    case "visibility-changed": {
      const to = VISIBILITY_WORDS[String(data.to)] ?? String(data.to);
      if (data.to === "private") {
        return [
          "Restricted",
          `Details restricted by the author, ${at}. It had been ${data.from === "unlisted" ? "available by link" : "public"} until then.`,
        ];
      }
      if (data.firstPublished) return ["Published", `Made ${to} by the author, ${at}`];
      if (data.from === "private") return ["Visibility", `Made ${to} again by the author, ${at}`];
      return ["Visibility", `Made ${to} by the author, ${at}`];
    }
    case "embargo-lifted": {
      const scheduled = when(data.scheduledFor);
      const to = data.to === "unlisted" ? " as an unlisted record" : "";
      return data.early
        ? [
            "Released",
            `Released early by the author${to}, ${at}${scheduled ? `. It had been scheduled for ${scheduled}.` : ""}`,
          ]
        : ["Released", `Released as scheduled${to}, ${scheduled ?? at}`];
    }
    case "embargo-changed": {
      const from = when(data.from);
      const to = when(data.to);
      if (!from && to) return ["Embargo", `Release scheduled for ${to}, set ${at}`];
      if (from && !to)
        return [
          "Embargo",
          `Scheduled release cancelled (it was set for ${from}), ${at}. The record stays private.`,
        ];
      if (from && to && from !== to) {
        const later = new Date(String(data.to)) > new Date(String(data.from));
        return ["Embargo", `Release moved ${later ? "later" : "earlier"}, from ${from} to ${to}, ${at}`];
      }
      return [
        "Embargo",
        `Fingerprint ${data.fingerprintShown ? "shown" : "hidden"} until the release, set ${at}`,
      ];
    }
    case "evidence-disclosure-changed":
      return [
        "Evidence detail",
        `Changed from ${presetLabel(data.from)} to ${presetLabel(data.to)} by the author, ${at}`,
      ];
    default:
      return [humanize(event.eventType), at];
  }
}
