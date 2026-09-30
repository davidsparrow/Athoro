import Link from "next/link";
import { AuthoroMark } from "./authoro-mark";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Authoro home">
          <AuthoroMark size={26} />
          <span className="font-serif text-xl tracking-tight">Authoro</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-ink-muted">
          <Link href="/#how" className="hidden hover:text-ink sm:inline">
            How it works
          </Link>
          <Link href="/#principles" className="hidden hover:text-ink sm:inline">
            Principles
          </Link>
          <Link href="/#open" className="hover:text-ink">
            Open source
          </Link>
        </nav>
      </div>
    </header>
  );
}
