"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { formatDate } from "@/lib/format";
import {
  EVIDENCE_PRESETS,
  VISIBILITIES,
  type EvidencePreset,
  type Visibility,
} from "@/lib/visibility-labels";

const subscribeNothing = () => () => {};

/** True after hydration, so local times are only rendered in the reader's own time zone. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/** A Date as the value of a datetime-local input, in the browser's time zone. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ProPill() {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
      Pro
    </span>
  );
}

function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  pro,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  pro?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex gap-3 rounded-lg border p-3 text-sm transition-colors ${checked ? "border-accent/60 bg-accent-soft/60" : "border-line"} ${disabled ? "opacity-60" : "cursor-pointer hover:border-ink/30"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center font-medium">
          {title}
          {pro ? <ProPill /> : null}
        </span>
        <span className="mt-0.5 block text-ink-muted">{children}</span>
      </span>
    </label>
  );
}

/**
 * Who can see a record: public, unlisted or private, and for a private record
 * that has never been published, an optional scheduled release (an embargo).
 * A published record's "private" is a restriction: its provenance stays public.
 */
export function AccessFields({
  defaultVisibility,
  defaultEmbargoUntil,
  defaultShowFingerprint,
  canUsePro,
  publishedAt,
  hideLegend = false,
}: {
  /** When a heading above already says what the fields are for. */
  hideLegend?: boolean;
  defaultVisibility: Visibility;
  defaultEmbargoUntil: string | null;
  defaultShowFingerprint: boolean;
  canUsePro: boolean;
  /** When the record was first published, if it has been. */
  publishedAt: string | null;
}) {
  const hydrated = useHydrated();
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);
  const [release, setRelease] = useState<"manual" | "scheduled">(
    defaultEmbargoUntil ? "scheduled" : "manual",
  );
  const [localUntil, setLocalUntil] = useState(() =>
    defaultEmbargoUntil ? toLocalInput(new Date(defaultEmbargoUntil)) : "",
  );
  const published = publishedAt !== null;
  const until = localUntil ? new Date(localUntil) : null;
  const isoUntil = until && !Number.isNaN(until.getTime()) ? until.toISOString() : "";
  const timeZone = hydrated ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return (
    <fieldset className="space-y-3">
      <legend className={hideLegend ? "sr-only" : "mb-3 text-sm font-medium"}>Who can see this record</legend>
      {(Object.keys(VISIBILITIES) as Visibility[]).map((value) => {
        const restricted = value === "private" && published;
        const locked = value !== "public" && !canUsePro && value !== defaultVisibility;
        return (
          <Choice
            key={value}
            name="visibility"
            value={value}
            checked={visibility === value}
            disabled={locked}
            onChange={() => setVisibility(value)}
            title={restricted ? "Restricted" : VISIBILITIES[value].label}
            pro={value !== "public"}
          >
            {restricted
              ? "Hide the details. Visitors still see the ID, when it was registered and public, its fingerprint and its history."
              : VISIBILITIES[value].description}
          </Choice>
        );
      })}
      {!canUsePro ? (
        <p className="text-sm text-ink-muted">
          Unlisted, private and embargoed records are part of Authoro Pro. Public records are always free.
        </p>
      ) : null}

      {visibility === "private" && published ? (
        <div className="rounded-lg border border-caution/40 bg-caution-soft p-4 text-sm">
          <p className="font-medium">This record has been public since {formatDate(publishedAt!)}.</p>
          <p className="mt-1 text-ink-muted">
            Restricting it can&apos;t unpublish it. Its link keeps working and says it was restricted by you,
            with the dates, fingerprint and history. Your statements and evidence are hidden.
          </p>
          <label className="mt-3 flex items-start gap-3">
            <input
              name="confirmRestrict"
              type="checkbox"
              required
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>I understand what visitors will still see.</span>
          </label>
        </div>
      ) : null}

      {visibility === "private" && !published ? (
        <div className="space-y-3 rounded-lg border border-line p-4 text-sm">
          <p className="font-medium">When should it become public?</p>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="release"
              value="manual"
              checked={release === "manual"}
              onChange={() => setRelease("manual")}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>Not until I publish it</span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="release"
              value="scheduled"
              checked={release === "scheduled"}
              onChange={() => setRelease("scheduled")}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              Automatically, at a set time (an embargo)
              <span className="mt-0.5 block text-ink-muted">
                Until then visitors see that a record exists, when it was registered and when it will be
                released. You can move or cancel the release beforehand; each change is recorded.
              </span>
            </span>
          </label>
          {release === "scheduled" ? (
            <div className="space-y-3 pl-7">
              {hydrated ? (
                <div className="space-y-1.5">
                  <label htmlFor="embargo-local" className="block font-medium">
                    Release at
                  </label>
                  <input
                    id="embargo-local"
                    type="datetime-local"
                    required
                    value={localUntil}
                    onChange={(event) => setLocalUntil(event.target.value)}
                    className="block w-full max-w-xs rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm text-ink focus:border-accent focus:outline-2 focus:outline-accent/30"
                  />
                  <p className="text-ink-muted">Your time zone: {timeZone}. Shown to readers in UTC.</p>
                </div>
              ) : null}
              <input type="hidden" name="embargoUntil" value={isoUntil} />
              <label className="flex items-start gap-3">
                <input
                  name="showFingerprint"
                  type="checkbox"
                  defaultChecked={defaultShowFingerprint}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  Show the document&apos;s fingerprint before the release
                  <span className="mt-0.5 block text-ink-muted">
                    Lets anyone holding a copy check it against this record, without revealing the document.
                    Leave it off if the work is short or easy to guess.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/** How much evidence detail the record shows. Free; Minimal hides content, not verifiability. */
export function PresetFields({
  defaultPreset,
  hideLegend = false,
}: {
  defaultPreset: EvidencePreset;
  hideLegend?: boolean;
}) {
  const [preset, setPreset] = useState<EvidencePreset>(defaultPreset);
  return (
    <fieldset className="space-y-3">
      <legend className={hideLegend ? "sr-only" : "mb-3 text-sm font-medium"}>
        How much evidence detail it shows
      </legend>
      {(Object.keys(EVIDENCE_PRESETS) as EvidencePreset[]).map((value) => (
        <Choice
          key={value}
          name="evidenceDisclosure"
          value={value}
          checked={preset === value}
          onChange={() => setPreset(value)}
          title={`${EVIDENCE_PRESETS[value].label}${value === "standard" ? " (default)" : ""}`}
        >
          {EVIDENCE_PRESETS[value].description}
        </Choice>
      ))}
      <p className="text-sm text-ink-muted">
        Every preset keeps who supplied each piece of evidence, its documentation links, fingerprints and
        integrity checks.
      </p>
    </fieldset>
  );
}
