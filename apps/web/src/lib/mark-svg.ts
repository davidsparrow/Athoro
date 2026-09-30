import type { MarkStyle, MarkTheme } from "./embed";

const THEMES = {
  light: { background: "#ffffff", border: "#e4e1d9", ink: "#16181d", muted: "#5b606b", check: "#0f6e56" },
  dark: { background: "#17191c", border: "#2a2d32", ink: "#eceae4", muted: "#9da1a9", check: "#4cc9a0" },
} as const;

function glyph(x: number, y: number, size: number, colors: (typeof THEMES)[MarkTheme]): string {
  const scale = size / 32;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
<circle cx="16" cy="16" r="14.5" stroke="${colors.ink}" stroke-width="2.4"/>
<path d="M9.5 24 16 7l6.5 17" stroke="${colors.ink}" stroke-width="3"/>
<path d="m11.6 18.2 3 2.8 6-6.4" stroke="${colors.check}" stroke-width="3"/>
</g>`;
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
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="${label}"><title>${label}</title>${glyph(0, 0, 20, colors)}</svg>`;
  }
  const idWidth = proofId.length * 6.6;
  const width = Math.round(4 + 14 + 5 + 43 + 7 + idWidth + 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${label}">
<title>${label}</title>
<rect x="0.5" y="0.5" width="${width - 1}" height="19" rx="9.5" fill="${colors.background}" stroke="${colors.border}"/>
${glyph(4, 3, 14, colors)}
<text x="23" y="13.9" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="${colors.ink}" textLength="43" lengthAdjust="spacingAndGlyphs">Authoro</text>
<text x="${23 + 43 + 7}" y="13.9" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10.5" fill="${colors.muted}" textLength="${idWidth}" lengthAdjust="spacingAndGlyphs">${proofId}</text>
</svg>`;
}
