/**
 * Authoro Mark geometry, on a 32-unit grid. One source for the site, the
 * favicon and the embeddable badge. Placeholder artwork pending final design.
 *
 * - Solid (the canonical mark): a disc with the A knocked out and a check for
 *   its crossbar that overshoots the right leg. Holds its silhouette at 12px.
 * - Open ring: the expressive large-size variant; the check escapes the circle.
 */
export const SOLID_MARK = {
  letter: "M9 24.6 16 6.8l7 17.8",
  check: "m10.9 18.4 3.6 3.4 9.2-10.2",
  strokeWidth: 3.5,
} as const;

export const OPEN_RING_MARK = {
  ring: "M29.86 14.05A14 14 0 1 1 18.91 2.31",
  ringWidth: 2.6,
  letter: "M8.8 25 16 6.5 23.2 25",
  check: "m11.2 18.6 3.4 3.2 11.4-13.2",
  strokeWidth: 3.2,
} as const;

/** The check takes the opposite theme's green so it stays visible on the disc. */
export const SOLID_MARK_COLORS = {
  light: { disc: "#16181d", letter: "#ffffff", check: "#4cc9a0" },
  dark: { disc: "#eceae4", letter: "#17191c", check: "#0f6e56" },
} as const;

/** The solid mark as a standalone SVG fragment in a 32-unit box. */
export function solidMarkSvg(colors: { disc: string; letter: string; check: string }): string {
  return `<circle cx="16" cy="16" r="16" fill="${colors.disc}"/><path d="${SOLID_MARK.letter}" stroke="${colors.letter}" stroke-width="${SOLID_MARK.strokeWidth}"/><path d="${SOLID_MARK.check}" stroke="${colors.check}" stroke-width="${SOLID_MARK.strokeWidth}"/>`;
}
