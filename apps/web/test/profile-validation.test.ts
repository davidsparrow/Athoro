import { describe, expect, it } from "vitest";
import { createProfileSchema, handleSchema, suggestHandle } from "@/lib/profile-validation";
import { safeNextPath } from "@/lib/redirects";

describe("handleSchema", () => {
  it("normalizes case, whitespace and a leading @", () => {
    expect(handleSchema.parse("  @Jane-Smith ")).toBe("jane-smith");
  });

  it.each([
    ["ab", "at least 3"],
    ["a".repeat(41), "at most 40"],
    ["-jane", "lowercase letters"],
    ["jane-", "lowercase letters"],
    ["jane_smith", "lowercase letters"],
    ["jane--smith", "single hyphens"],
    ["settings", "reserved"],
    ["authoro", "reserved"],
  ])("rejects %s", (input, message) => {
    const result = handleSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });

  it("matches the database check constraint", () => {
    const dbPattern = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
    for (const handle of ["abc", "jane-smith", "a1b", "x".repeat(40)]) {
      expect(handleSchema.safeParse(handle).success).toBe(true);
      expect(dbPattern.test(handle)).toBe(true);
    }
  });
});

describe("createProfileSchema", () => {
  const base = { handle: "jane", displayName: " Jane Smith ", bio: "", websiteUrl: "", isPublic: true };

  it("trims and turns empty optional fields into null", () => {
    expect(createProfileSchema.parse(base)).toEqual({
      handle: "jane",
      displayName: "Jane Smith",
      bio: null,
      websiteUrl: null,
      isPublic: true,
    });
  });

  it("only accepts http(s) websites", () => {
    expect(createProfileSchema.safeParse({ ...base, websiteUrl: "https://jane.example" }).success).toBe(true);
    expect(createProfileSchema.safeParse({ ...base, websiteUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createProfileSchema.safeParse({ ...base, websiteUrl: "jane.example" }).success).toBe(false);
  });

  it("requires a display name", () => {
    expect(createProfileSchema.safeParse({ ...base, displayName: "   " }).success).toBe(false);
  });
});

describe("suggestHandle", () => {
  it("slugifies names and strips diacritics", () => {
    expect(suggestHandle("Zoë Adèle")).toBe("zoe-adele");
    expect(suggestHandle("  J. R. R. Tolkien ")).toBe("j-r-r-tolkien");
    expect(suggestHandle("李")).toBe("");
    expect(suggestHandle("x".repeat(60))).toHaveLength(40);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/p/AU-7K3F92?x=1")).toBe("/p/AU-7K3F92?x=1");
    expect(safeNextPath(["/settings", "/x"])).toBe("/settings");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
    undefined,
  ])("falls back for %s", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });
});
