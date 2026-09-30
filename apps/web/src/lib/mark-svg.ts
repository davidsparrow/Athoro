import type { MarkStyle, MarkTheme } from "./embed";
import { SOLID_MARK_COLORS, solidMarkSvg } from "./mark-geometry";

const THEMES = {
  light: {
    background: "#ffffff",
    border: "#e4e1d9",
    ink: "#16181d",
    muted: "#5b606b",
    mark: SOLID_MARK_COLORS.light,
  },
  dark: {
    background: "#17191c",
    border: "#2a2d32",
    ink: "#eceae4",
    muted: "#9da1a9",
    mark: SOLID_MARK_COLORS.dark,
  },
} as const;

function glyph(x: number, y: number, size: number, theme: MarkTheme): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="none" stroke-linecap="round" stroke-linejoin="round">${solidMarkSvg(THEMES[theme].mark)}</g>`;
}

/**
 * The embeddable Authoro Mark. Only the validated proof ID is interpolated, so
 * no user-supplied text ever reaches the SVG. `textLength` pins text widths
 * because images can't load web fonts.
 */
export function renderMarkSvg(proofId: string, style: MarkStyle, theme: MarkTheme): string {
  const colors = THEMES[theme];
  const label = `Authoro creation record ${proofId}`;
  if (style === "icon") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="${label}"><title>${label}</title>${glyph(0, 0, 20, theme)}</svg>`;
  }
  const idWidth = proofId.length * 6.6;
  const width = Math.round(4 + 14 + 5 + 43 + 7 + idWidth + 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${label}">
<title>${label}</title>
<rect x="0.5" y="0.5" width="${width - 1}" height="19" rx="9.5" fill="${colors.background}" stroke="${colors.border}"/>
${glyph(3, 3, 14, theme)}
<text x="23" y="13.9" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="${colors.ink}" textLength="43" lengthAdjust="spacingAndGlyphs">Authoro</text>
<text x="${23 + 43 + 7}" y="13.9" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10.5" fill="${colors.muted}" textLength="${idWidth}" lengthAdjust="spacingAndGlyphs">${proofId}</text>
</svg>`;
}
