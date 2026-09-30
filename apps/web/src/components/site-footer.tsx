import { AuthoroMark } from "./authoro-mark";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <AuthoroMark size={18} />
          <span>Authoro · The record behind the work.</span>
        </div>
        <p>Looking up a record is always free.</p>
      </div>
    </footer>
  );
}
