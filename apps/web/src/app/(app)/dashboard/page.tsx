import { parseProofId, WORK_TYPES, type WorkType } from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { formatDate, formatNumber } from "@/lib/format";
import { getMetricTotals } from "@/lib/proof";
import { listWorksForUser } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";
import { displayUrl, proofUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { session, profile } = await requireAuthor("/dashboard");
  const { registered } = await searchParams;
  const justRegistered = typeof registered === "string" ? parseProofId(registered) : null;
  const works = await listWorksForUser(db, session.user.id);
  const metrics = await getMetricTotals(
    db,
    works.map((work) => work.recordId),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Signed in as</p>
          <h1 className="font-serif text-3xl tracking-tight">{profile.displayName}</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/settings" className={buttonClass("secondary")}>
            Profile &amp; settings
          </Link>
          <Link href="/register" className={buttonClass("primary")}>
            Register a work
          </Link>
        </div>
      </div>

      {justRegistered ? (
        <div className="mt-8">
          <Alert tone="success">
            <span className="font-medium">Registered.</span> Your record is live at{" "}
            <Link href={`/p/${justRegistered}`} className="font-mono underline underline-offset-4">
              {displayUrl(proofUrl(justRegistered))}
            </Link>
            .{" "}
            <Link href={`/p/${justRegistered}#embed`} className="underline underline-offset-4">
              Get the Authoro Mark
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="font-medium">Your works</h2>
          {works.length ? (
            <ul className="mt-4 divide-y divide-line">
              {works.map((work) => (
                <li key={work.proofId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {work.status === "pending_attestation" ? (
                        work.title
                      ) : (
                        <Link
                          href={`/p/${work.proofId}`}
                          className="hover:underline hover:underline-offset-4"
                        >
                          {work.title}
                        </Link>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {WORK_TYPES[work.workType as WorkType] ?? work.workType} · v{work.versionNumber} ·{" "}
                      <span className="font-mono">{work.proofId}</span>
                    </p>
                  </div>
                  {work.status === "pending_attestation" ? (
                    <Link href={`/attest/${work.proofId}`} className={buttonClass("secondary", "h-9")}>
                      Finish attestation
                    </Link>
                  ) : (
                    <span className="text-right text-sm text-ink-muted">
                      {work.status === "registered" ? "Registered" : "Withdrawn"}
                      {work.registeredAt ? ` ${formatDate(work.registeredAt)}` : ""}
                      <span className="block text-xs">
                        {formatNumber(metrics.get(work.recordId)?.markClicks ?? 0)} mark clicks ·{" "}
                        {formatNumber(metrics.get(work.recordId)?.pageViews ?? 0)} views
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center">
              <p className="font-serif text-xl">No registered works yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
                Registering a work fingerprints it, records how it was made, and gives it a permanent public
                record with an Authoro Mark.
              </p>
              <Link href="/register" className={`${buttonClass("primary")} mt-6`}>
                Register your first work
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-medium">Author profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-ink-muted">Byline</dt>
              <dd>{profile.displayName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Handle</dt>
              <dd className="font-mono">@{profile.handle}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Author page</dt>
              <dd>{profile.isPublic ? "Public" : "Hidden"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
