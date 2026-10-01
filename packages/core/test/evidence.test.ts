import { describe, expect, it } from "vitest";
import { creationDisclosureSchema } from "../src/evidence";

describe("creationDisclosureSchema", () => {
  it("accepts a typical AI-assisted disclosure", () => {
    const result = creationDisclosureSchema.safeParse({
      methods: ["ai-assisted", "collaborative"],
      aiUses: ["editing"],
      aiTools: ["Claude"],
      note: "AI was used for copyediting and shortening selected passages.",
    });
    expect(result.success).toBe(true);
  });

  it("defaults optional lists", () => {
    const result = creationDisclosureSchema.parse({ methods: ["manual"] });
    expect(result.aiUses).toEqual([]);
    expect(result.aiTools).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("accepts links to the author's own documentation", () => {
    const result = creationDisclosureSchema.safeParse({
      methods: ["manual"],
      links: [{ url: "https://jane.example/process", label: "Drafts and notes" }],
    });
    expect(result.success).toBe(true);
    expect(
      creationDisclosureSchema.safeParse({ methods: ["manual"], links: [{ url: "ftp://jane.example/" }] })
        .success,
    ).toBe(false);
  });

  it("rejects contradictory or empty disclosures", () => {
    expect(creationDisclosureSchema.safeParse({ methods: [] }).success).toBe(false);
    expect(creationDisclosureSchema.safeParse({ methods: ["manual", "ai-assisted"] }).success).toBe(false);
    expect(creationDisclosureSchema.safeParse({ methods: ["manual"], aiTools: ["Claude"] }).success).toBe(
      false,
    );
    expect(creationDisclosureSchema.safeParse({ methods: ["imported", "imported"] }).success).toBe(false);
  });
});
