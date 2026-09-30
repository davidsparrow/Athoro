import { WORK_TYPES, type WorkType } from "@authoro/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { formatDate, formatMonth } from "@/lib/format";
import { normalizeHandle } from "@/lib/profile-validation";
import { getAuthorPage } from "@/lib/profiles";
import { appOrigin, displayUrl } from "@/lib/urls";

const loadAuthorPage = cache((handle: string) => getAuthorPage(db, handle));

export async function generateMetadata({ params }: PageProps<"/a/[handle]">): Promise<Metadata> {
  const handle = normalizeHandle(decodeURIComponent((await params).handle));
  const page = await loadAuthorPage(handle);
  if (!page) return { title: "Author not found" };
  const { displayName, bio } = page.profile;
  const description =
    bio ?? `Creation records for works that ${displayName} (@${handle}) has registered on Authoro.`;
  return {
    title: `${displayName} (@${handle})`,
    description,
    alternates: { canonical: `${appOrigin()}/a/${handle}` },
    openGraph: { title: `${displayName} on Authoro`, description, type: "profile", username: handle },
  };
}

export default async function AuthorPage({ params }: PageProps<"/a/[handle]">) {
  const raw = decodeURIComponent((await params).handle);
  const handle = normalizeHandle(raw);
  if (raw !== handle) permanentRedirect(`/a/${encodeURIComponent(handle)}`);

  // Unknown and hidden pages look the same, so a hidden page doesn't confirm the handle exists.
  const page = await loadAuthorPage(handle);
  if (!page) notFound();
  const { profile, works } = page;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header>
        <p className="text-xs tracking-wide text-ink-muted uppercase">Author</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          {profile.displayName}
        </h1>
        <p className="mt-2 font-mono text-sm text-ink-muted">@{profile.handle}</p>
        {profile.bio ? <p className="mt-5 leading-relaxed whitespace-pre-line">{profile.bio}</p> : null}
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
          {profile.websiteUrl ? (
            <a
              href={profile.websiteUrl}
              rel="nofollow ugc noopener"
              target="_blank"
              className="underline underline-offset-4 hover:text-ink"
            >
              {displayUrl(profile.websiteUrl)} ↗
            </a>
          ) : null}
          <span>On Authoro since {formatMonth(profile.memberSince)}</span>
        </p>
      </header>

      <section className="mt-12">
        <h2 className="mb-5 font-serif text-2xl tracking-tight">Registered works</h2>
        {works.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper-raised">
            {works.map((work) => (
              <li key={work.workId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link
                    href={`/p/${work.proofId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {work.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {WORK_TYPES[work.workType as WorkType] ?? work.workType} · Version {work.versionNumber}
                    {work.versionCount > 1 ? ` · ${work.versionCount} versions` : ""}
                  </p>
                </div>
                <p className="text-right text-sm text-ink-muted">
                  {work.status === "withdrawn" ? "Withdrawn" : "Registered"}
                  {work.registeredAt ? ` ${formatDate(work.registeredAt)}` : ""}
                  <span className="block font-mono text-xs">{work.proofId}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-muted">
            No public records yet.
          </p>
        )}
      </section>

      <p className="mt-12 text-sm leading-relaxed text-ink-muted">
        {profile.displayName} wrote this profile. Authoro doesn&apos;t verify identity, and pen names are
        welcome. Each record shows who made each claim about a work, and when.
      </p>
    </div>
  );
}
