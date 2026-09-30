import { describe, expect, it } from "vitest";
import { embedSnippets } from "@/lib/embed";
import { readFileSync } from "node:fs";
import { SOLID_MARK } from "@/lib/mark-geometry";
import { renderMarkSvg } from "@/lib/mark-svg";

describe("embedSnippets", () => {
  const snippets = embedSnippets("AU-7K3F92", "https://authoro.net");
  const byId = Object.fromEntries(snippets.map((s) => [s.id, s.code]));

  it("links every visual variant to the record with ref=mark", () => {
    for (const id of ["html", "icon", "wordpress", "markdown"]) {
      expect(byId[id]).toContain("https://authoro.net/p/AU-7K3F92?ref=mark");
    }
    expect(byId.html).toContain('src="https://authoro.net/p/AU-7K3F92/mark.svg"');
    expect(byId.icon).toContain("mark.svg?style=icon");
    expect(byId.wordpress).toMatch(/^<!-- wp:html -->\n<a .*<\/a>\n<!-- \/wp:html -->$/);
    expect(byId.text).toBe("Authoro creation record: https://authoro.net/p/AU-7K3F92");
  });

  it("supports the dark theme", () => {
    const dark = embedSnippets("AU-7K3F92", "https://authoro.net", "dark");
    expect(dark.find((s) => s.id === "icon")?.code).toContain(
      "mark.svg?style=icon&amp;theme=dark".replace("&amp;", "&"),
    );
  });
});

describe("renderMarkSvg", () => {
  it("renders a labelled badge and icon", () => {
    const badge = renderMarkSvg("AU-7K3F92", "badge", "light");
    expect(badge).toMatch(/^<svg [^>]*height="20"/);
    expect(badge).toContain("<title>Authoro creation record AU-7K3F92</title>");
    expect(badge).toContain(">AU-7K3F92</text>");
    const icon = renderMarkSvg("AU-7K3F92", "icon", "dark");
    expect(icon).toContain('width="20" height="20"');
    expect(icon).toContain('fill="#eceae4"');
  });
});

describe("mark geometry", () => {
  it("keeps the static favicon in sync with the shared geometry", () => {
    const icon = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
    expect(icon).toContain(`d="${SOLID_MARK.letter}"`);
    expect(icon).toContain(`d="${SOLID_MARK.check}"`);
    expect(icon).toContain(`stroke-width="${SOLID_MARK.strokeWidth}"`);
  });

  it("uses the same geometry in the embeddable badge", () => {
    const badge = renderMarkSvg("AU-7K3F92", "badge", "light");
    expect(badge).toContain(SOLID_MARK.letter);
    expect(badge).toContain(SOLID_MARK.check);
  });
});
