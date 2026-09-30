import { Button, inputClass } from "@/components/ui";

/** Plain GET form so looking up an ID works without JavaScript; /verify resolves it. */
export function IdLookup({ defaultValue, error }: { defaultValue?: string; error?: string | null }) {
  return (
    <form action="/verify" method="get" className="space-y-2">
      <label htmlFor="lookup-id" className="sr-only">
        Authoro ID
      </label>
      <div className="flex gap-2">
        <input
          id="lookup-id"
          name="id"
          required
          defaultValue={defaultValue}
          placeholder="AU-7K3F92"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          className={`${inputClass} max-w-xs font-mono uppercase placeholder:normal-case`}
        />
        <Button type="submit" variant="secondary">
          Look up
        </Button>
      </div>
      {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
