import {
  fingerprintPastedText,
  hashCanonicalJson,
  hashLegalName,
  isProofId,
  isWorkId,
  type AuthorAttestation,
} from "@authoro/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attestations, authorAttestations, proofRecords, recordEvents, works } from "@/db/schema";
import {
  discardPendingRegistration,
  finalizeRegistration,
  findRegisteredByFingerprint,
  getOwnedRegistration,
  listWorksForUser,
  prepareRegistration,
  RegistrationError,
} from "@/lib/registration";
import { validateRegistration } from "@/lib/registration-validation";
import { createAuthor, sampleInput, testDatabase, valid } from "./helpers";

const db = testDatabase();

describe("validateRegistration", () => {
  it("accepts a complete registration and normalizes empty fields", async () => {
    const data = valid(await sampleInput());
    expect(data.work.canonicalUrl).toBeNull();
    expect(data.envelope).toBeNull();
  });

  it("rejects bad hashes and unknown work types", async () => {
    const input = await sampleInput();
    const result = validateRegistration({
      ...input,
      work: { ...input.work, workType: "vibes" },
      document: { ...input.document, contentHash: "md5:x" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("work.workType"))).toBe(true);
      expect(result.errors.some((e) => e.startsWith("document.contentHash"))).toBe(true);
    }
  });

  it("requires an attached envelope to describe the same document", async () => {
    const input = await sampleInput();
    const envelope = {
      schema: "authoro-proof/1.0",
      issuer: { id: "issuer:writermark", name: "Writermark" },
      work: { hash: input.document.textHash },
      evidence: { class: "continuous-observed", method: "continuous-composition", sessions: 6 },
    };
    expect(valid({ ...input, envelopeJson: JSON.stringify(envelope) }).envelope?.issuer.name).toBe(
      "Writermark",
    );
    const other = { ...envelope, work: { hash: `sha256:${"f".repeat(64)}` } };
    const result = validateRegistration({ ...input, envelopeJson: JSON.stringify(other) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("different document");
    expect(validateRegistration({ ...input, envelopeJson: "{nope" }).ok).toBe(false);
  });
});

describe.skipIf(!db)("registration lifecycle", () => {
  const d = db!;

  const author = (handle?: string) => createAuthor(d, handle);

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  it("prepares a pending record with author-supplied evidence", async () => {
    const { userId, profile } = await author();
    const input = await sampleInput();
    const envelope = {
      schema: "authoro-proof/1.0",
      issuer: { id: "issuer:writermark", name: "Writermark" },
      work: { hash: input.document.contentHash },
      evidence: { method: "continuous-composition" },
      signature: "abc",
    };
    const { proofId, workId } = await prepareRegistration(d, {
      userId,
      profile,
      registration: valid({ ...input, envelopeJson: JSON.stringify(envelope) }),
    });
    expect(isProofId(proofId)).toBe(true);
    expect(isWorkId(workId)).toBe(true);

    const registration = await getOwnedRegistration(d, proofId, userId);
    expect(registration?.record.status).toBe("pending_attestation");
    expect(registration?.version).toMatchObject({
      versionNumber: 1,
      authorDisplayName: "Jane Smith",
      textCanonicalization: "authoro-text/1",
    });
    const [disclosure, submittedEnvelope] = registration!.evidence;
    expect(disclosure).toMatchObject({
      evidenceClass: "self",
      claimType: "creation-disclosure",
      issuerId: null,
    });
    expect(disclosure!.payloadHash).toBe(await hashCanonicalJson(disclosure!.payload));
    expect(submittedEnvelope).toMatchObject({
      evidenceClass: "self",
      claimType: "proof-envelope",
      signatureStatus: "unverifiable",
    });
    expect(await getOwnedRegistration(d, proofId, (await author("other")).userId)).toBeNull();
  });

  it("finalizes with a human attestation bound to the version", async () => {
    const { userId, profile } = await author();
    const { proofId } = await prepareRegistration(d, {
      userId,
      profile,
      registration: valid(await sampleInput()),
    });
    const now = new Date("2026-09-30T16:42:17Z");
    const { attestationHash } = await finalizeRegistration(d, {
      proofId,
      userId,
      typedName: "  Jane   Smith ",
      now,
    });

    const registration = await getOwnedRegistration(d, proofId, userId);
    expect(registration?.record).toMatchObject({ status: "registered", registeredAt: now });

    const [stored] = await d.select().from(authorAttestations);
    const payload = stored!.payload as AuthorAttestation;
    expect(stored!.attestationHash).toBe(attestationHash);
    expect(await hashCanonicalJson(payload)).toBe(attestationHash);
    expect(payload).toMatchObject({
      proofId,
      contentHash: registration!.version.contentHash,
      author: registration!.work.authorProfileId,
      disclosureHash: registration!.evidence[0]!.payloadHash,
      signedAt: now.toISOString(),
    });
    expect(payload.legalNameHash).toBe(await hashLegalName("jane smith", stored!.legalNameSalt));
    expect(JSON.stringify(payload)).not.toContain("Jane Smith");
    expect(JSON.stringify(payload)).not.toContain(userId);

    const events = await d
      .select()
      .from(recordEvents)
      .where(eq(recordEvents.proofRecordId, registration!.record.id));
    expect(events).toMatchObject([{ eventType: "registered", actorUserId: userId }]);
  });

  it("refuses to finalize twice, for someone else, or without a name", async () => {
    const { userId, profile } = await author();
    const { proofId } = await prepareRegistration(d, {
      userId,
      profile,
      registration: valid(await sampleInput()),
    });
    const other = await author("other");
    await expect(
      finalizeRegistration(d, { proofId, userId: other.userId, typedName: "Mallory" }),
    ).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(finalizeRegistration(d, { proofId, userId, typedName: " " })).rejects.toMatchObject({
      code: "invalid-name",
    });
    await finalizeRegistration(d, { proofId, userId, typedName: "Jane Smith" });
    await expect(
      finalizeRegistration(d, { proofId, userId, typedName: "Jane Smith" }),
    ).rejects.toBeInstanceOf(RegistrationError);
  });

  it("discards pending registrations completely but never registered ones", async () => {
    const { userId, profile } = await author();
    const pending = await prepareRegistration(d, {
      userId,
      profile,
      registration: valid(await sampleInput("a")),
    });
    await discardPendingRegistration(d, { proofId: pending.proofId, userId });
    expect(await d.select().from(works)).toHaveLength(0);
    expect(await d.select().from(attestations)).toHaveLength(0);

    const registered = await prepareRegistration(d, {
      userId,
      profile,
      registration: valid(await sampleInput("b")),
    });
    await finalizeRegistration(d, { proofId: registered.proofId, userId, typedName: "Jane Smith" });
    await expect(
      discardPendingRegistration(d, { proofId: registered.proofId, userId }),
    ).rejects.toMatchObject({
      code: "not-pending",
    });
    expect(await d.select().from(proofRecords)).toHaveLength(1);
  });

  it("lists works and finds registered duplicates by fingerprint", async () => {
    const { userId, profile } = await author();
    const input = await sampleInput("Shared text.");
    const first = await prepareRegistration(d, { userId, profile, registration: valid(input) });
    expect(await findRegisteredByFingerprint(d, input.document)).toHaveLength(0);
    await finalizeRegistration(d, { proofId: first.proofId, userId, typedName: "Jane Smith" });
    await prepareRegistration(d, { userId, profile, registration: valid(await sampleInput("Other text.")) });

    const listed = await listWorksForUser(d, userId);
    expect(listed.map((w) => w.status).sort()).toEqual(["pending_attestation", "registered"]);

    const pasted = await fingerprintPastedText("Shared   text.\n");
    const matches = await findRegisteredByFingerprint(d, {
      contentHash: pasted.contentHash,
      textHash: pasted.textHash!,
    });
    expect(matches).toMatchObject([{ proofId: first.proofId, authorDisplayName: "Jane Smith" }]);
  });
});
