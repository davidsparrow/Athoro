import { parseProofId, WORK_TYPES, type WorkType } from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { formatDate, formatNumber } from "@/lib/format";
import { getMetricTotals, type MetricTotals } from "@/lib/proof";
import { listWorksForUser } from "@/lib/registration";
import { requireAuthor } from "@/lib/session";
import { displayUrl, proofUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "Dashboard" };

type WorkRow = Awaited<ReturnType<typeof listWorksForUser>>[number];

/** One entry per work: its newest attested version and any draft of the next one. */
function groupByWork(rows: WorkRow[]) {
  const groups = new Map<string, { workId: string; latest?: WorkRow; draft?: WorkRow; records: WorkRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.workId) ?? { workId: row.workId, records: [] };
    groups.set(row.workId, group);
    if (row.status === "pending_attestation") group.draft ??= row;
    else {
      group.latest ??= row;
      group.records.push(row);
    }
  }
  return [...groups.values()];
}

function sumMetrics(recordIds: string[], metrics: Map<string, MetricTotals>) {
  let markClicks = 0;
  let pageViews = 0;
  for (const id of recordIds) {
    markClicks += metrics.get(id)?.markClicks ?? 0;
    pageViews += metrics.get(id)?.pageViews ?? 0;
  }
  return { markClicks, pageViews };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { session, profile } = await requireAuthor("/dashboard");
  const { registered } = await searchParams;
  const justRegistered = typeof registered === "string" ? parseProofId(registered) : null;
  const rows = await listWorksForUser(db, session.user.id);
  const works = groupByWork(rows);
  const metrics = await getMetricTotals(
    db,
    rows.map((row) => row.recordId),
  );
  const registeredVersion = rows.find((row) => row.proofId === justRegistered)?.versionNumber ?? 1;

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
            <span className="font-medium">
              {registeredVersion > 1 ? `Version ${registeredVersion} registered.` : "Registered."}
            </span>{" "}
            Your record is live at{" "}
            <Link href={`/p/${justRegistered}`} className="font-mono underline underline-offset-4">
              {displayUrl(proofUrl(justRegistered))}
            </Link>
            .{" "}
            {registeredVersion > 1
              ? "The earlier version's record now notes that a newer version exists. "
              : ""}
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
              {works.map(({ workId, latest, draft, records }) => {
                const shown = (latest ?? draft)!;
                const totals = sumMetrics(
                  records.map((record) => record.recordId),
                  metrics,
                );
                return (
                  <li key={workId} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {latest ? (
                            <Link
                              href={`/p/${latest.proofId}`}
                              className="hover:underline hover:underline-offset-4"
                            >
                              {latest.title}
                            </Link>
                          ) : (
                            shown.title
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {WORK_TYPES[shown.workType as WorkType] ?? shown.workType} · v{shown.versionNumber}{" "}
                          · <span className="font-mono">{shown.proofId}</span>
                        </p>
                      </div>
                      {latest ? (
                        <span className="text-right text-sm text-ink-muted">
                          {latest.status === "registered" ? "Registered" : "Withdrawn"}
                          {latest.registeredAt ? ` ${formatDate(latest.registeredAt)}` : ""}
                          <span className="block text-xs">
                            {formatNumber(totals.markClicks)} mark clicks · {formatNumber(totals.pageViews)}{" "}
                            views
                            {records.length > 1 ? " (all versions)" : ""}
                          </span>
                        </span>
                      ) : (
                        <Link href={`/attest/${shown.proofId}`} className={buttonClass("secondary", "h-9")}>
                          Finish attestation
                        </Link>
                      )}
                    </div>
                    {latest ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        {draft ? (
                          <>
                            Version {draft.versionNumber} (<span className="font-mono">{draft.proofId}</span>)
                            is waiting for you.{" "}
                            <Link
                              href={`/attest/${draft.proofId}`}
                              className="text-ink underline underline-offset-4"
                            >
                              Finish attestation
                            </Link>
                          </>
                        ) : (
                          <Link
                            href={`/register?work=${workId}`}
                            className="underline underline-offset-4 hover:text-ink"
                          >
                            Register a new version
                          </Link>
                        )}
                      </p>
                    ) : null}
                  </li>
                );
              })}
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
              <dd>
                {profile.isPublic ? (
                  <Link href={`/a/${profile.handle}`} className="underline underline-offset-4">
                    Public
                  </Link>
                ) : (
                  "Hidden"
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
