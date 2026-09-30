import Link from "next/link";
import { getSession } from "@/lib/session";
import { AuthoroMark } from "./authoro-mark";
import { SignOutButton } from "./sign-out-button";
import { buttonClass } from "./ui";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Authoro home">
          <AuthoroMark size={26} />
          <span className="font-serif text-xl tracking-tight">Authoro</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-ink-muted sm:gap-5">
          <Link href="/#how" className="hidden hover:text-ink md:inline">
            How it works
          </Link>
          <Link href="/#principles" className="hidden hover:text-ink md:inline">
            Principles
          </Link>
          <Link href="/verify" className="hover:text-ink">
            Verify
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="hover:text-ink">
                Dashboard
              </Link>
              <SignOutButton className="hover:text-ink" />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hover:text-ink">
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonClass("primary", "h-9")}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
