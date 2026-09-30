import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonicalJson } from "../src/canonical-json";

describe("canonicalJson", () => {
  it("sorts keys recursively and drops undefined members", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, undefined, "x"], c: null }, e: undefined })).toBe(
      '{"a":{"c":null,"d":[3,null,"x"]},"b":1}',
    );
  });

  it("orders keys by UTF-16 code units", () => {
    expect(canonicalJson({ "é": 1, z: 2, A: 3 })).toBe('{"A":3,"z":2,"é":1}');
  });

  it("serializes numbers like ECMAScript", () => {
    expect(canonicalJson([1.0, 1e21, 0.1, -0])).toBe("[1,1e+21,0.1,0]");
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });

  it("uses toJSON for dates", () => {
    expect(canonicalJson({ at: new Date("2026-09-30T00:00:00Z") })).toBe('{"at":"2026-09-30T00:00:00.000Z"}');
  });

  it("hashes equal objects equally regardless of key order", async () => {
    expect(await hashCanonicalJson({ x: 1, y: 2 })).toBe(await hashCanonicalJson({ y: 2, x: 1 }));
  });
});
