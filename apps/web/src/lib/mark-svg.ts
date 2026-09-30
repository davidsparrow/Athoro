import type { MarkStatus, MarkStyle, MarkTheme } from "./embed";
import { SOLID_MARK_COLORS, solidMarkSvg, WITHDRAWN_MARK_COLORS } from "./mark-geometry";

const THEMES = {
  light: {
    background: "#ffffff",
    border: "#e4e1d9",
    ink: "#16181d",
    muted: "#5b606b",
    mark: SOLID_MARK_COLORS.light,
    withdrawnMark: WITHDRAWN_MARK_COLORS.light,
  },
  dark: {
    background: "#17191c",
    border: "#2a2d32",
    ink: "#eceae4",
    muted: "#9da1a9",
    mark: SOLID_MARK_COLORS.dark,
    withdrawnMark: WITHDRAWN_MARK_COLORS.dark,
  },
} as const;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function glyph(x: number, y: number, size: number, theme: MarkTheme, status: MarkStatus): string {
  const colors = status === "withdrawn" ? THEMES[theme].withdrawnMark : THEMES[theme].mark;
  return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="none" stroke-linecap="round" stroke-linejoin="round">${solidMarkSvg(colors)}</g>`;
}

/**
 * The embeddable Authoro Mark. Only the validated proof ID is interpolated, so
 * no user-supplied text ever reaches the SVG. `textLength` pins text widths
 * because images can't load web fonts. A withdrawn record's mark is muted,
 * loses its check and says "withdrawn" after the ID.
 */
export function renderMarkSvg(
  proofId: string,
  style: MarkStyle,
  theme: MarkTheme,
  status: MarkStatus = "registered",
): string {
  const colors = THEMES[theme];
  const withdrawn = status === "withdrawn";
  const label = `Authoro creation record ${proofId}${withdrawn ? " (withdrawn)" : ""}`;
  if (style === "icon") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="${label}"><title>${label}</title>${glyph(0, 0, 20, theme, status)}</svg>`;
  }
  const idX = 23 + 43 + 7;
  const idWidth = proofId.length * 6.6;
  // "· withdrawn": a 5px gap, a dot, another 5px gap, then the word.
  const dotX = idX + idWidth + 5 + 1.2;
  const statusX = dotX + 1.2 + 5;
  const statusWidth = 52;
  const width = Math.round((withdrawn ? statusX + statusWidth : idX + idWidth) + 7);
  const statusText = withdrawn
    ? `
<circle cx="${dotX}" cy="10" r="1.2" fill="${colors.muted}"/>
<text x="${statusX}" y="13.9" font-family="${SANS}" font-size="10.5" font-weight="600" fill="${colors.ink}" textLength="${statusWidth}" lengthAdjust="spacingAndGlyphs">withdrawn</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${label}">
<title>${label}</title>
<rect x="0.5" y="0.5" width="${width - 1}" height="19" rx="9.5" fill="${colors.background}" stroke="${colors.border}"/>
${glyph(3, 3, 14, theme, status)}
<text x="23" y="13.9" font-family="${SANS}" font-size="11" font-weight="600" fill="${withdrawn ? colors.muted : colors.ink}" textLength="43" lengthAdjust="spacingAndGlyphs">Authoro</text>
<text x="${idX}" y="13.9" font-family="${MONO}" font-size="10.5" fill="${colors.muted}" textLength="${idWidth}" lengthAdjust="spacingAndGlyphs">${proofId}</text>${statusText}
</svg>`;
}
