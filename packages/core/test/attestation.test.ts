import { describe, expect, it } from "vitest";
import {
  buildAuthorAttestation,
  hashAttestationStatement,
  hashLegalName,
  normalizeTypedName,
} from "../src/attestation";
import { hashCanonicalJson } from "../src/canonical-json";

const contentHash = `sha256:${"1".repeat(64)}`;

describe("author attestation", () => {
  it("normalizes and salts typed names", async () => {
    expect(normalizeTypedName("  Jane   Q.\tSmith ")).toBe("Jane Q. Smith");
    const h1 = await hashLegalName("Jane Smith", "salt-1");
    expect(await hashLegalName("  jane  SMITH", "salt-1")).toBe(h1);
    expect(await hashLegalName("Jane Smith", "salt-2")).not.toBe(h1);
  });

  it("builds an attestation bound to the version and statement", async () => {
    const signedAt = new Date("2026-09-30T16:42:17Z");
    const { attestation, attestationHash } = await buildAuthorAttestation({
      proofId: "AU-7K3F92",
      contentHash,
      textHash: null,
      author: "profile_123",
      legalNameHash: await hashLegalName("Jane Smith", "salt"),
      signedAt,
    });
    expect(attestation).toMatchObject({
      type: "author-attestation",
      schema: "authoro-author-attestation/1.0",
      proofId: "AU-7K3F92",
      contentHash,
      statementVersion: "1.0",
      statementHash: await hashAttestationStatement("1.0"),
      signedAt: "2026-09-30T16:42:17.000Z",
    });
    expect(attestation).not.toHaveProperty("textHash");
    expect(attestationHash).toBe(await hashCanonicalJson(attestation));
  });
});
