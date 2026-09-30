import { proofUrl } from "./urls";

export type MarkStyle = "badge" | "icon";
export type MarkTheme = "light" | "dark";

export interface EmbedSnippet {
  id: "html" | "icon" | "markdown" | "wordpress" | "text";
  label: string;
  hint: string;
  code: string;
}

function markSrc(proofId: string, origin: string, style: MarkStyle, theme: MarkTheme): string {
  const params = new URLSearchParams();
  if (style !== "badge") params.set("style", style);
  if (theme !== "light") params.set("theme", theme);
  const query = params.toString();
  return `${proofUrl(proofId, origin)}/mark.svg${query ? `?${query}` : ""}`;
}

/**
 * Ready-to-paste ways to show the Authoro Mark next to a work. Every variant
 * links to the canonical record with ?ref=mark so click-through can be counted.
 */
export function embedSnippets(proofId: string, origin: string, theme: MarkTheme = "light"): EmbedSnippet[] {
  const page = proofUrl(proofId, origin);
  const link = `${page}?ref=mark`;
  const alt = `Authoro creation record ${proofId}`;
  const badge = `<a href="${link}" title="View creation record" target="_blank" rel="noopener"><img src="${markSrc(proofId, origin, "badge", theme)}" alt="${alt}" height="20"></a>`;
  const icon = `<a href="${link}" title="View creation record" target="_blank" rel="noopener"><img src="${markSrc(proofId, origin, "icon", theme)}" alt="${alt}" width="20" height="20"></a>`;

  return [
    { id: "html", label: "HTML badge", hint: "Paste beside your byline in any HTML page.", code: badge },
    { id: "icon", label: "Icon only", hint: "A compact mark for tight spaces such as bylines.", code: icon },
    {
      id: "wordpress",
      label: "WordPress",
      hint: "Paste into the code editor, or into a Custom HTML block.",
      code: `<!-- wp:html -->\n${badge}\n<!-- /wp:html -->`,
    },
    {
      id: "markdown",
      label: "Markdown",
      hint: "For READMEs, Ghost, Substack notes and other Markdown editors.",
      code: `[![${alt}](${markSrc(proofId, origin, "badge", theme)})](${link})`,
    },
    {
      id: "text",
      label: "Plain text",
      hint: "For print, PDFs, email and social posts.",
      code: `Authoro creation record: ${page}`,
    },
  ];
}
