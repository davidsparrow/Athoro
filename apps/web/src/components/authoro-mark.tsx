import { OPEN_RING_MARK, SOLID_MARK } from "@/lib/mark-geometry";

/**
 * The Authoro A-mark. `solid` is the canonical mark (a seal with an A whose
 * crossbar is a check); `open` is the large expressive variant. Colors follow
 * the site theme through CSS variables.
 */
export function AuthoroMark({
  size = 20,
  variant = "solid",
  title,
  className,
}: {
  size?: number;
  variant?: "solid" | "open";
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
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {variant === "solid" ? (
        <>
          <circle cx="16" cy="16" r="16" fill="var(--ink)" />
          <path d={SOLID_MARK.letter} stroke="var(--paper)" strokeWidth={SOLID_MARK.strokeWidth} />
          <path d={SOLID_MARK.check} stroke="var(--mark-check)" strokeWidth={SOLID_MARK.strokeWidth} />
        </>
      ) : (
        <>
          <path d={OPEN_RING_MARK.ring} stroke="var(--ink)" strokeWidth={OPEN_RING_MARK.ringWidth} />
          <path d={OPEN_RING_MARK.letter} stroke="var(--ink)" strokeWidth={OPEN_RING_MARK.strokeWidth} />
          <path d={OPEN_RING_MARK.check} stroke="var(--accent)" strokeWidth={OPEN_RING_MARK.strokeWidth} />
        </>
      )}
    </svg>
  );
}
