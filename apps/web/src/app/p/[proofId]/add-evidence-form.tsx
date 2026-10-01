"use client";

import { useState, useTransition } from "react";
import {
  describeLinkError,
  emptyLink,
  LinksEditor,
  linksFromDrafts,
  type LinkDraft,
} from "@/components/links-editor";
import { Alert, Button, inputClass } from "@/components/ui";
import { addEvidenceAction } from "./evidence-actions";

/** The owner adds documentation links or a Proof Envelope to a registered version. */
export function AddEvidenceForm({ proofId }: { proofId: string }) {
  const [kind, setKind] = useState<"links" | "envelope">("links");
  const [links, setLinks] = useState<LinkDraft[]>([emptyLink()]);
  const [envelope, setEnvelope] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors([]);
    startTransition(async () => {
      const result = await addEvidenceAction(
        proofId,
        kind === "links"
          ? { links: linksFromDrafts(links), confirm }
          : { envelope: envelope.trim(), confirm },
      );
      if (result.errors) return setErrors(result.errors.map(describeLinkError));
      setLinks([emptyLink()]);
      setEnvelope("");
      setConfirm(false);
      setOpen(false);
      setAdded(true);
    });
  }

  return (
    <>
      <details
        className="group mt-4"
        open={open}
        onToggle={(event) => {
          setOpen(event.currentTarget.open);
          if (event.currentTarget.open) setAdded(false);
        }}
      >
        <summary className="inline-flex cursor-pointer list-none text-sm font-medium underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          Add documentation or evidence…
        </summary>
        <form onSubmit={submit} className="mt-5 space-y-5 border-t border-line pt-5">
          {errors.length ? (
            <Alert tone="error">
              <ul className="space-y-1">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div
            role="tablist"
            className="inline-flex rounded-lg border border-line bg-paper-sunken p-1 text-sm"
          >
            {(
              [
                ["links", "Links to documentation"],
                ["envelope", "A Proof Envelope"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => {
                  setKind(value);
                  setErrors([]);
                }}
                className={`rounded-md px-4 py-1.5 ${kind === value ? "bg-paper-raised font-medium shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "links" ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Shown as <span className="text-ink">Author supplied</span>, each as &ldquo;Documentation
                hosted by&rdquo; its site. Only https:// links.
              </p>
              <LinksEditor links={links} onChange={setLinks} idPrefix="add-link" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-muted">
                Exported by a writing app, school or publisher. It&apos;s shown as reported by the
                organization it names, and its <code className="font-mono text-xs">work.hash</code> must match
                this version.
              </p>
              <textarea
                aria-label="Proof Envelope JSON"
                rows={7}
                value={envelope}
                onChange={(event) => setEnvelope(event.target.value)}
                placeholder='{ "schema": "authoro-proof/1.1", "issuer": { … }, "work": { "hash": "sha256:…" }, "evidence": { … } }'
                className={`${inputClass} font-mono text-xs`}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted hover:text-ink">
                <span className="underline underline-offset-4">Load from a .json file</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={async (event) => setEnvelope((await event.target.files?.[0]?.text()) ?? "")}
                />
              </label>
            </div>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              Add this to the public record now. It&apos;s dated and shown as added after your attestation,
              which stays as it is. You can revoke it later, but not edit or delete it.
            </span>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add to the record"}
          </Button>
        </form>
      </details>
      {added ? (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          <span className="font-medium text-accent">✓ Added.</span> It&apos;s on the record under{" "}
          <a href="#evidence" className="text-ink underline underline-offset-4">
            Added after registration
          </a>
          .
        </p>
      ) : null}
    </>
  );
}
