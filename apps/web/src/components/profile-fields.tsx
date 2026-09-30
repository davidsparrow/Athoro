import type { ReactNode } from "react";
import { Field, inputClass } from "@/components/ui";

interface Values {
  displayName?: string;
  bio?: string | null;
  websiteUrl?: string | null;
  isPublic?: boolean;
}

/** Display name, bio, website and visibility inputs shared by onboarding and settings. */
export function ProfileFields({
  values,
  errors,
  afterDisplayName,
}: {
  values: Values;
  errors?: Record<string, string>;
  /** Rendered directly below the display name, e.g. the handle during onboarding. */
  afterDisplayName?: ReactNode;
}) {
  return (
    <>
      <Field
        label="Display name"
        htmlFor="displayName"
        hint="Shown as the byline on your records."
        error={errors?.displayName}
      >
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={80}
          defaultValue={values.displayName ?? ""}
          aria-invalid={Boolean(errors?.displayName)}
          className={inputClass}
        />
      </Field>
      {afterDisplayName}
      <Field
        label="Bio"
        htmlFor="bio"
        hint="Optional. A sentence or two about your work."
        error={errors?.bio}
      >
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={values.bio ?? ""}
          aria-invalid={Boolean(errors?.bio)}
          className={inputClass}
        />
      </Field>
      <Field label="Website" htmlFor="websiteUrl" hint="Optional." error={errors?.websiteUrl}>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={200}
          defaultValue={values.websiteUrl ?? ""}
          aria-invalid={Boolean(errors?.websiteUrl)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="isPublic"
          defaultChecked={values.isPublic ?? true}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="font-medium">Public author page</span>
          <span className="block text-ink-muted">
            List your registered works on a public page. Each record stays public either way.
          </span>
        </span>
      </label>
    </>
  );
}
