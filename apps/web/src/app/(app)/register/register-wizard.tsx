"use client";

import {
  abbreviateHash,
  AI_USES,
  CREATION_METHODS,
  fingerprintDocument,
  fingerprintPastedText,
  inferMediaType,
  WORK_TYPES,
  type AiUse,
  type CreationMethod,
  type WorkType,
} from "@authoro/core";
import { useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import {
  MAX_DOCUMENT_BYTES,
  validateRegistration,
  workDetailsSchema,
  type RegistrationInput,
} from "@/lib/registration-validation";
import { checkFingerprintAction, prepareRegistrationAction, type FingerprintMatch } from "./actions";

const STEPS = ["The work", "The document", "How it was made", "Review"] as const;
const AI_METHODS: CreationMethod[] = ["ai-assisted", "ai-generated-sections"];

type DocumentFingerprint = RegistrationInput["document"] & { label: string };

export function RegisterWizard({ byline }: { byline: string }) {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, startSubmit] = useTransition();

  const [work, setWork] = useState({
    title: "",
    workType: "article" as WorkType,
    canonicalUrl: "",
    description: "",
  });

  const [docMode, setDocMode] = useState<"file" | "text">("file");
  const [pastedText, setPastedText] = useState("");
  const [document, setDocument] = useState<DocumentFingerprint | null>(null);
  const [hashing, setHashing] = useState(false);
  const [matches, setMatches] = useState<FingerprintMatch[]>([]);

  const [methods, setMethods] = useState<CreationMethod[]>([]);
  const [aiUses, setAiUses] = useState<AiUse[]>([]);
  const [aiTools, setAiTools] = useState("");
  const [note, setNote] = useState("");
  const [envelopeJson, setEnvelopeJson] = useState("");
  const [showEnvelope, setShowEnvelope] = useState(false);

  const usedAi = methods.some((method) => AI_METHODS.includes(method));

  function buildInput(fingerprint = document): RegistrationInput | null {
    if (!fingerprint) return null;
    return {
      work,
      document: {
        source: fingerprint.source,
        contentHash: fingerprint.contentHash,
        textHash: fingerprint.textHash,
        mediaType: fingerprint.mediaType,
        byteLength: fingerprint.byteLength,
        wordCount: fingerprint.wordCount,
      },
      disclosure: {
        methods,
        aiUses: usedAi ? aiUses : [],
        aiTools: usedAi
          ? aiTools
              .split(",")
              .map((tool) => tool.trim())
              .filter(Boolean)
          : [],
        note: note.trim() || undefined,
      },
      envelopeJson: envelopeJson.trim() || undefined,
    };
  }

  async function adoptFingerprint(fingerprint: DocumentFingerprint): Promise<FingerprintMatch[]> {
    setDocument(fingerprint);
    const found = await checkFingerprintAction({
      contentHash: fingerprint.contentHash,
      textHash: fingerprint.textHash,
    });
    setMatches(found);
    return found;
  }

  async function onFile(file: File | undefined) {
    setErrors([]);
    if (!file) return;
    if (file.size === 0) return setErrors(["That file is empty."]);
    if (file.size > MAX_DOCUMENT_BYTES) {
      return setErrors([`Files can be at most ${formatBytes(MAX_DOCUMENT_BYTES)} for now.`]);
    }
    setHashing(true);
    try {
      const fingerprint = await fingerprintDocument({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: inferMediaType(file.name, file.type),
      });
      await adoptFingerprint({
        source: "file",
        label: file.name,
        contentHash: fingerprint.contentHash,
        textHash: fingerprint.textHash ?? null,
        mediaType: fingerprint.mediaType,
        byteLength: fingerprint.byteLength,
        wordCount: fingerprint.wordCount ?? null,
      });
    } finally {
      setHashing(false);
    }
  }

  async function next() {
    setErrors([]);
    if (step === 0) {
      const result = workDetailsSchema.safeParse(work);
      if (!result.success) return setErrors(result.error.issues.map((issue) => issue.message));
    }
    if (step === 1) {
      if (docMode === "text" && !document) {
        if (!pastedText.trim()) return setErrors(["Paste the text of your work."]);
        setHashing(true);
        try {
          const fingerprint = await fingerprintPastedText(pastedText);
          const found = await adoptFingerprint({
            source: "text",
            label: "Pasted text",
            contentHash: fingerprint.contentHash,
            textHash: fingerprint.textHash ?? null,
            mediaType: fingerprint.mediaType,
            byteLength: fingerprint.byteLength,
            wordCount: fingerprint.wordCount ?? null,
          });
          // Pause so the author sees the duplicate notice; continuing again proceeds.
          if (found.length) return;
        } finally {
          setHashing(false);
        }
      } else if (!document) {
        return setErrors(["Choose a file to fingerprint."]);
      }
    }
    if (step === 2) {
      const input = buildInput();
      const validation = input ? validateRegistration(input) : null;
      if (validation && !validation.ok) {
        return setErrors(
          validation.errors.map((error) =>
            error.replace(/^disclosure\.\w+: /, "").replace(/^envelopeJson: /, ""),
          ),
        );
      }
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function submit() {
    const input = buildInput();
    if (!input) return;
    setErrors([]);
    startSubmit(async () => {
      const result = await prepareRegistrationAction(input);
      if (result?.errors) setErrors(result.errors);
    });
  }

  function toggleMethod(method: CreationMethod) {
    setMethods((current) => {
      if (current.includes(method)) return current.filter((m) => m !== method);
      // "Fully manual" and the AI options contradict each other; picking one clears the other.
      const withoutConflicts = current.filter((m) =>
        method === "manual" ? !AI_METHODS.includes(m) : AI_METHODS.includes(method) ? m !== "manual" : true,
      );
      return [...withoutConflicts, method];
    });
  }

  return (
    <div className="space-y-8">
      <ol className="grid grid-cols-4 gap-2 text-xs sm:text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`border-t-2 pt-2 ${index <= step ? "border-accent text-ink" : "border-line text-ink-muted"}`}
          >
            <span className="font-mono">{index + 1}</span> <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>

      <h2 className="font-serif text-2xl tracking-tight">{STEPS[step]}</h2>

      {errors.length ? (
        <Alert tone="error">
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {step === 0 ? (
        <div className="space-y-5">
          <Field label="Title" htmlFor="title">
            <input
              id="title"
              value={work.title}
              maxLength={300}
              onChange={(event) => setWork({ ...work, title: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Type of work" htmlFor="workType">
            <select
              id="workType"
              value={work.workType}
              onChange={(event) => setWork({ ...work, workType: event.target.value as WorkType })}
              className={inputClass}
            >
              {Object.entries(WORK_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Where it's published"
            htmlFor="canonicalUrl"
            hint="Optional. The canonical URL readers will find it at. You can register before publishing."
          >
            <input
              id="canonicalUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={work.canonicalUrl}
              onChange={(event) => setWork({ ...work, canonicalUrl: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Description" htmlFor="description" hint="Optional. Shown on the public record.">
            <textarea
              id="description"
              rows={3}
              maxLength={2000}
              value={work.description}
              onChange={(event) => setWork({ ...work, description: event.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-ink-muted">
            Your browser computes the document&apos;s SHA-256 fingerprint.{" "}
            <strong className="font-medium text-ink">The document never leaves this device</strong>; Authoro
            receives only its fingerprints.
          </p>
          <div
            role="tablist"
            className="inline-flex rounded-lg border border-line bg-paper-sunken p-1 text-sm"
          >
            {(["file", "text"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={docMode === mode}
                onClick={() => {
                  setDocMode(mode);
                  setDocument(null);
                  setMatches([]);
                  setErrors([]);
                }}
                className={`rounded-md px-4 py-1.5 ${docMode === mode ? "bg-paper-raised font-medium shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {mode === "file" ? "Upload a file" : "Paste text"}
              </button>
            ))}
          </div>

          {docMode === "file" ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper-raised px-6 py-10 text-center hover:border-accent">
              <span className="font-medium">{hashing ? "Fingerprinting…" : "Choose a file"}</span>
              <span className="text-sm text-ink-muted">
                Any format up to {formatBytes(MAX_DOCUMENT_BYTES)}. Text, Markdown and HTML also get a text
                fingerprint that matches copies pasted from the web.
              </span>
              <input
                type="file"
                className="sr-only"
                data-testid="document-file"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </label>
          ) : (
            <Field label="Text of the work" htmlFor="pastedText">
              <textarea
                id="pastedText"
                rows={10}
                value={pastedText}
                onChange={(event) => {
                  setPastedText(event.target.value);
                  setDocument(null);
                }}
                className={`${inputClass} font-serif text-base`}
              />
            </Field>
          )}

          {document ? <FingerprintSummary document={document} /> : null}
          <DuplicateNotice matches={matches} />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-ink-muted">
            Describe how this work was made, in your own words. Your record will show this as{" "}
            <span className="rounded bg-caution-soft px-1.5 py-0.5 text-xs text-caution">
              Author supplied
            </span>{" "}
            so readers know it&apos;s your statement rather than independently observed evidence.
          </p>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">How was it made? Select all that apply.</legend>
            {(
              Object.entries(CREATION_METHODS) as [
                CreationMethod,
                (typeof CREATION_METHODS)[CreationMethod],
              ][]
            ).map(([method, { label, description }]) => (
              <label
                key={method}
                className={`flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-sm ${methods.includes(method) ? "border-accent bg-accent-soft" : "border-line bg-paper-raised"}`}
              >
                <input
                  type="checkbox"
                  checked={methods.includes(method)}
                  onChange={() => toggleMethod(method)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-ink-muted">{description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {usedAi ? (
            <div className="space-y-5 rounded-xl border border-line bg-paper-sunken p-5">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">What did AI help with?</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(AI_USES) as [AiUse, string][]).map(([use, label]) => (
                    <label
                      key={use}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${aiUses.includes(use) ? "border-accent bg-accent-soft" : "border-line bg-paper-raised"}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={aiUses.includes(use)}
                        onChange={() =>
                          setAiUses((current) =>
                            current.includes(use) ? current.filter((u) => u !== use) : [...current, use],
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field
                label="Which AI tools?"
                htmlFor="aiTools"
                hint="Optional. Separate with commas, e.g. Claude, Grammarly."
              >
                <input
                  id="aiTools"
                  value={aiTools}
                  onChange={(event) => setAiTools(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          <Field
            label="Anything readers should know?"
            htmlFor="note"
            hint="Optional. For example: “AI was used for copyediting and shortening selected passages.”"
          >
            <textarea
              id="note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl border border-line">
            <button
              type="button"
              onClick={() => setShowEnvelope(!showEnvelope)}
              aria-expanded={showEnvelope}
              className="flex w-full items-center justify-between px-5 py-4 text-left text-sm"
            >
              <span>
                <span className="font-medium">Attach evidence from another tool</span>
                <span className="block text-ink-muted">
                  Optional. A Proof Envelope (<code className="font-mono text-xs">authoro-proof/1.0</code>)
                  exported by a writing app or recorder.
                </span>
              </span>
              <span aria-hidden>{showEnvelope ? "−" : "+"}</span>
            </button>
            {showEnvelope ? (
              <div className="space-y-3 border-t border-line px-5 py-4">
                <textarea
                  aria-label="Proof Envelope JSON"
                  rows={8}
                  value={envelopeJson}
                  onChange={(event) => setEnvelopeJson(event.target.value)}
                  placeholder='{ "schema": "authoro-proof/1.0", "issuer": { … }, "work": { "hash": "sha256:…" }, "evidence": { … } }'
                  className={`${inputClass} font-mono text-xs`}
                />
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted hover:text-ink">
                  <span className="underline underline-offset-4">Load from a .json file</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={async (event) => setEnvelopeJson((await event.target.files?.[0]?.text()) ?? "")}
                  />
                </label>
                <p className="text-xs text-ink-muted">
                  Its <code className="font-mono">work.hash</code> must match your document. Signatures
                  aren&apos;t verified yet, so it appears as evidence you submitted, attributed to the tool it
                  names.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 3 && document ? (
        <Review
          byline={byline}
          work={work}
          document={document}
          methods={methods}
          aiUses={usedAi ? aiUses : []}
          aiTools={usedAi ? aiTools : ""}
          note={note}
          hasEnvelope={Boolean(envelopeJson.trim())}
          matches={matches}
        />
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-6">
        {step > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setErrors([]);
              setStep(step - 1);
            }}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={hashing}>
            {hashing ? "Fingerprinting…" : "Continue"}
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Preparing…" : "Continue to attestation"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FingerprintSummary({ document }: { document: DocumentFingerprint }) {
  return (
    <div className="rounded-xl border border-line bg-paper-raised p-5 text-sm">
      <p className="font-medium">{document.label}</p>
      <p className="mt-1 text-ink-muted">
        {document.mediaType} · {formatBytes(document.byteLength)}
        {document.wordCount !== null ? ` · ${formatNumber(document.wordCount)} words` : ""}
      </p>
      <dl className="mt-4 space-y-2 font-mono text-xs">
        <div className="flex flex-wrap gap-x-3">
          <dt className="text-ink-muted">Exact fingerprint</dt>
          <dd title={document.contentHash}>{abbreviateHash(document.contentHash, 12, 8)}</dd>
        </div>
        {document.textHash ? (
          <div className="flex flex-wrap gap-x-3">
            <dt className="text-ink-muted">Text fingerprint</dt>
            <dd title={document.textHash}>{abbreviateHash(document.textHash, 12, 8)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-ink-muted">
        {document.textHash
          ? "Readers can verify the exact file, or text copied from wherever it's published."
          : "Readers can verify an exact copy of this file."}
      </p>
    </div>
  );
}

function DuplicateNotice({ matches }: { matches: FingerprintMatch[] }) {
  if (!matches.length) return null;
  const allMine = matches.every((match) => match.mine);
  return (
    <Alert tone="info">
      <p className="font-medium">
        {allMine ? "You've already registered this document." : "This document is already registered."}
      </p>
      <ul className="mt-2 space-y-1 text-ink-muted">
        {matches.map((match) => (
          <li key={match.proofId}>
            <span className="font-mono text-ink">{match.proofId}</span> · {match.title} ·{" "}
            {match.authorDisplayName}
            {match.registeredAt ? ` · ${formatDate(match.registeredAt)}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-muted">
        You can still continue. Each record shows who registered it and when.
      </p>
    </Alert>
  );
}

function Review(props: {
  byline: string;
  work: { title: string; workType: WorkType; canonicalUrl: string; description: string };
  document: DocumentFingerprint;
  methods: CreationMethod[];
  aiUses: AiUse[];
  aiTools: string;
  note: string;
  hasEnvelope: boolean;
  matches: FingerprintMatch[];
}) {
  const rows: [string, ReactNode][] = [
    ["Title", props.work.title],
    ["Byline", props.byline],
    ["Type", WORK_TYPES[props.work.workType]],
    ["Published at", props.work.canonicalUrl || "Not given"],
    ["Document", `${props.document.label} · ${formatBytes(props.document.byteLength)}`],
    ["How it was made", props.methods.map((method) => CREATION_METHODS[method].label).join(", ")],
  ];
  if (props.aiUses.length) rows.push(["AI helped with", props.aiUses.map((use) => AI_USES[use]).join(", ")]);
  if (props.aiTools.trim()) rows.push(["AI tools", props.aiTools]);
  if (props.note.trim()) rows.push(["Your note", props.note]);
  if (props.hasEnvelope) rows.push(["Attached evidence", "Proof Envelope"]);

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-line rounded-xl border border-line bg-paper-raised text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <DuplicateNotice matches={props.matches} />
      <p className="text-sm text-ink-muted">
        Next you&apos;ll confirm these details and attest to them. Nothing is public until you do.
      </p>
    </div>
  );
}
