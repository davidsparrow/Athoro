import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, buttonClass } from "@/components/ui";
import { requireAuthor } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile } = await requireAuthor("/dashboard");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Signed in as</p>
          <h1 className="font-serif text-3xl tracking-tight">{profile.displayName}</h1>
        </div>
        <Link href="/settings" className={buttonClass("secondary")}>
          Profile &amp; settings
        </Link>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="font-medium">Your works</h2>
          <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center">
            <p className="font-serif text-xl">No registered works yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              Registering a work fingerprints it, records how it was made, and gives it a permanent public
              record with an Authoro Mark.
            </p>
            <Button className="mt-6" disabled title="Work registration arrives in the next update">
              Register a work
            </Button>
            <p className="mt-2 text-xs text-ink-muted">Registration opens in the next update.</p>
          </div>
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
