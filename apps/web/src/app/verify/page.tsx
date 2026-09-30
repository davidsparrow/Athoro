import { parseProofId } from "@authoro/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IdLookup } from "@/components/id-lookup";
import { DocumentLookup } from "./document-lookup";

export const metadata: Metadata = {
  title: "Verify",
  description: "Look up an Authoro record by ID, or check whether a document matches a registered work.",
};

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { id } = await searchParams;
  const submitted = typeof id === "string" ? id : undefined;
  const proofId = submitted ? parseProofId(submitted) : null;
  if (proofId) redirect(`/p/${proofId}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <h1 className="font-serif text-4xl tracking-tight">Verify</h1>
      <p className="mt-3 leading-relaxed text-ink-muted">
        Checking is free and needs no account. Documents are fingerprinted on your device; Authoro only ever
        sees their hashes.
      </p>

      <section className="mt-12">
        <h2 className="font-serif text-2xl tracking-tight">Look up an Authoro ID</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          IDs look like AU-7K3F92 and appear beside the Authoro Mark.
        </p>
        <IdLookup
          defaultValue={submitted}
          error={submitted ? "That doesn't look like an Authoro ID. IDs look like AU-7K3F92." : null}
        />
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl tracking-tight">Check a document</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Find registered records that match a file, or text copied from where it was published.
        </p>
        <DocumentLookup />
      </section>
    </div>
  );
}
