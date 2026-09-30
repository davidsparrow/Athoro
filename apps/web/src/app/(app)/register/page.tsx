import { parseWorkId } from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { getWorkForNewVersion } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";
import { RegisterWizard } from "./register-wizard";

export async function generateMetadata({ searchParams }: PageProps<"/register">): Promise<Metadata> {
  const { work } = await searchParams;
  return { title: work ? "Register a new version" : "Register a work" };
}

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { work: workParam } = await searchParams;
  if (workParam === undefined) {
    const { profile } = await requireAuthor("/register");
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="font-serif text-3xl tracking-tight">Register a work</h1>
        <p className="mt-2 text-ink-muted">
          Creates a permanent, public record of this version of your work, bylined {profile.displayName}.
        </p>
        <div className="mt-10">
          <RegisterWizard byline={profile.displayName} />
        </div>
      </div>
    );
  }

  const workId = typeof workParam === "string" ? parseWorkId(workParam) : null;
  if (!workId) notFound();
  const { session, profile } = await requireAuthor(`/register?work=${workId}`);
  const found = await getWorkForNewVersion(db, workId, session.user.id);
  if (!found) notFound();
  const { work, latest, draft, versions, nextVersionNumber } = found;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">New version</p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight">
        {draft ? "Register a new version" : `Register version ${nextVersionNumber}`}
      </h1>
      <p className="mt-2 text-ink-muted">
        Of &ldquo;{work.title}&rdquo; <span className="font-mono text-sm">{work.publicId}</span>
      </p>

      {draft || !latest ? (
        <div className="mt-10 space-y-6">
          <Alert tone="info">
            <p className="font-medium">Version {draft?.versionNumber} is waiting for your attestation.</p>
            <p className="mt-1 text-ink-muted">
              A work can have one unfinished version at a time. Finish or discard{" "}
              <span className="font-mono text-ink">{draft?.proofId}</span> before starting another.
            </p>
          </Alert>
          <div className="flex flex-wrap gap-3">
            {draft ? (
              <Link href={`/attest/${draft.proofId}`} className={buttonClass("primary")}>
                Open the draft
              </Link>
            ) : null}
            <Link href="/dashboard" className={buttonClass("secondary")}>
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            It gets its own Authoro ID and record, bylined {profile.displayName}. Version{" "}
            {latest.versionNumber} (<span className="font-mono">{latest.proofId}</span>) stays valid, and its
            record will note that a newer version exists.
          </p>
          <div className="mt-10">
            <RegisterWizard
              byline={profile.displayName}
              newVersion={{
                workId: work.publicId,
                versionNumber: nextVersionNumber,
                workType: work.workType,
                initial: {
                  title: latest.title,
                  canonicalUrl: latest.canonicalUrl ?? "",
                  description: latest.description ?? "",
                },
                previous: versions.map(({ versionNumber, proofId, contentHash, textHash }) => ({
                  versionNumber,
                  proofId,
                  contentHash,
                  textHash,
                })),
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
