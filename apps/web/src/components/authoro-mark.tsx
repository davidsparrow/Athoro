/**
 * The Authoro A-mark: an A whose crossbar is a check, inside an open circle.
 * Drawn on a 32-unit grid with heavy strokes so it stays legible at 12–16px.
 * Placeholder artwork until the final mark is designed.
 */
export function AuthoroMark({
  size = 20,
  title,
  className,
}: {
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r="14.5" strokeWidth="2" />
      <path d="M9.5 24 16 7l6.5 17" strokeWidth="2.6" />
      <path d="m11.6 18.2 3 2.8 6-6.4" strokeWidth="2.6" className="text-accent" stroke="currentColor" />
    </svg>
  );
}
