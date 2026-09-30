"use client";

import { useState, useTransition } from "react";
import { Alert, Button, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createApiKeyAction, revokeApiKeyAction } from "./api-key-actions";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeysPanel({ keys }: { keys: ApiKeySummary[] }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = keys.filter((key) => !key.revokedAt);

  return (
    <div className="space-y-5">
      {created ? (
        <Alert tone="success">
          <p className="font-medium">Copy your new key now. It won&apos;t be shown again.</p>
          <code
            className="mt-2 block rounded bg-paper-raised px-3 py-2 font-mono text-xs break-all"
            data-testid="new-api-key"
          >
            {created}
          </code>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(created);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createApiKeyAction(name);
            if ("error" in result) return setError(result.error);
            setCreated(result.key);
            setCopied(false);
            setName("");
          });
        }}
      >
        <label htmlFor="apiKeyName" className="sr-only">
          Key name
        </label>
        <input
          id="apiKeyName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What will use it? e.g. My blog"
          maxLength={60}
          required
          className={`${inputClass} max-w-xs`}
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>

      {active.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {active.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{key.name}</span>{" "}
                <code className="font-mono text-xs text-ink-muted">{key.prefix}…</code>
                <span className="block text-xs text-ink-muted">
                  Created {formatDate(key.createdAt)} ·{" "}
                  {key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : "never used"}
                </span>
              </span>
              <Button
                variant="danger"
                className="h-8"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Revoke “${key.name}”? Anything using it will stop working.`)) return;
                  startTransition(() => revokeApiKeyAction(key.id));
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No active keys.</p>
      )}
    </div>
  );
}
