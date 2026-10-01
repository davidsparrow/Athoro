import { DOCUMENTATION_SCHEMA, hashCanonicalJson, type ProofEnvelope } from "@authoro/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { proofRecords } from "@/db/schema";
import {
  addEvidence,
  EvidenceError,
  listPendingEvidence,
  MAX_PENDING_EVIDENCE,
  reviewEvidence,
  revokeEvidence,
} from "@/lib/evidence";
import { validateEvidenceSubmission, type EvidenceSubmission } from "@/lib/evidence-validation";
import { getPublicProof, type PublicProof } from "@/lib/proof";
import {
  finalizeRegistration,
  prepareRegistration,
  prepareVersion,
  withdrawRecord,
} from "@/lib/registration";
import { createAuthor, registerWork, sampleInput, testDatabase, valid } from "./helpers";

const db = testDatabase();
const TEXT = "The future of independent software is small.";

const documentation = (url = "https://jane.example/notes", label?: string): EvidenceSubmission => ({
  kind: "documentation",
  links: [{ url, ...(label ? { label } : {}) }],
});

async function envelopeFor(text: string, issuer = "Writermark", extra: Partial<ProofEnvelope> = {}) {
  const { document } = await sampleInput(text);
  const slug = issuer.toLowerCase().replace(/\s+/g, "-");
  return {
    schema: "authoro-proof/1.1",
    issuer: { id: `issuer:${slug}`, name: issuer },
    work: { hash: document.contentHash },
    evidence: { class: "platform-history", method: "revision-history" },
    links: [{ url: `https://${slug}.example/audit/1`, label: "Audit trail" }],
    ...extra,
  } as ProofEnvelope;
}

async function expectEvidenceError(promise: Promise<unknown>, code: EvidenceError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(EvidenceError);
  expect((error as EvidenceError).code).toBe(code);
  return error as EvidenceError;
}

describe("validateEvidenceSubmission", () => {
  const document = { contentHash: `sha256:${"a".repeat(64)}`, textHash: null };

  it("takes links or an envelope, not both or neither", () => {
    expect(validateEvidenceSubmission({ links: [{ url: "https://jane.example/" }] }, document)).toMatchObject(
      {
        ok: true,
        submission: { kind: "documentation" },
      },
    );
    expect(validateEvidenceSubmission({}, document).ok).toBe(false);
    expect(validateEvidenceSubmission({ links: [], envelope: {} }, document).ok).toBe(false);
    expect(validateEvidenceSubmission({ links: [] }, document)).toEqual({
      ok: false,
      errors: ["links: Add at least one link."],
    });
  });

  it("checks an envelope describes the version", () => {
    const envelope = {
      schema: "authoro-proof/1.0",
      issuer: { id: "issuer:x", name: "X" },
      work: { hash: document.contentHash },
      evidence: { method: "x" },
    };
    expect(validateEvidenceSubmission({ envelope: JSON.stringify(envelope) }, document).ok).toBe(true);
    const other = validateEvidenceSubmission(
      { envelope: { ...envelope, work: { hash: `sha256:${"b".repeat(64)}` } } },
      document,
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.errors[0]).toContain("different document");
  });
});

describe.skipIf(!db)("evidence added after registration", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  async function publicProof(proofId: string, viewerId?: string) {
    const proof = await getPublicProof(d, proofId, viewerId);
    expect(proof?.kind).toBe("record");
    return proof as PublicProof;
  }

  it("publishes the author's additions at once, dated and attributed, and leaves the attestation alone", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, TEXT);
    const before = await publicProof(proofId);
    const now = new Date("2026-10-02T09:00:00Z");

    const added = await addEvidence(d, {
      proofId,
      userId: author.userId,
      via: "author",
      submission: documentation("https://jane.example/notes", "Drafts and notes"),
      now,
    });
    expect(added).toMatchObject({ status: "active", claimType: "documentation", versionNumber: 1 });

    const proof = await publicProof(proofId);
    expect(proof.authorAttestation).toEqual(before.authorAttestation);
    const item = proof.evidence.find((e) => e.id === added.evidenceId)!;
    expect(item).toMatchObject({ addedVia: "author", status: "active", claimType: "documentation" });
    expect(item.payload).toEqual({
      schema: DOCUMENTATION_SCHEMA,
      links: [{ url: "https://jane.example/notes", label: "Drafts and notes" }],
    });
    expect(item.payloadHash).toBe(await hashCanonicalJson(item.payload));
    expect(proof.events.at(-1)).toMatchObject({
      eventType: "evidence-added",
      data: { evidenceId: added.evidenceId, claimType: "documentation", via: "author" },
      createdAt: now,
    });
    const [source] = proof.provenance[0]!.sources.filter((s) => s.evidenceId === added.evidenceId);
    expect(source).toMatchObject({
      attribution: "Author supplied",
      supplier: { kind: "author", name: "Jane Smith" },
      links: [{ host: "jane.example", label: "Drafts and notes" }],
    });
  });

  it("holds an integration's submission for the author's approval", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, TEXT);
    const submission: EvidenceSubmission = { kind: "envelope", envelope: await envelopeFor(TEXT) };
    const { evidenceId, status } = await addEvidence(d, {
      proofId,
      userId: author.userId,
      via: "api",
      submission,
    });
    expect(status).toBe("pending_approval");

    // Readers see nothing yet; the author sees it waiting.
    const anonymous = await publicProof(proofId);
    expect(anonymous.evidence.map((e) => e.id)).not.toContain(evidenceId);
    expect(anonymous.pendingEvidence).toEqual([]);
    expect(anonymous.events.map((e) => e.eventType)).toEqual(["registered"]);
    expect((await publicProof(proofId, author.userId)).pendingEvidence.map((e) => e.id)).toEqual([
      evidenceId,
    ]);
    expect(await listPendingEvidence(d, author.userId)).toMatchObject([
      { evidenceId, proofId, versionNumber: 1, claimType: "proof-envelope" },
    ]);

    await expectEvidenceError(
      addEvidence(d, { proofId, userId: author.userId, via: "api", submission }),
      "duplicate",
    );
    const someoneElse = await createAuthor(d, "other");
    await expectEvidenceError(
      reviewEvidence(d, { proofId, evidenceId, userId: someoneElse.userId, decision: "approve" }),
      "not-found",
    );

    const approvedAt = new Date("2026-10-03T10:00:00Z");
    await reviewEvidence(d, {
      proofId,
      evidenceId,
      userId: author.userId,
      decision: "approve",
      now: approvedAt,
    });
    const proof = await publicProof(proofId);
    expect(proof.evidence.find((e) => e.id === evidenceId)).toMatchObject({
      status: "active",
      addedVia: "api",
      reviewedAt: approvedAt,
    });
    expect(proof.events.at(-1)).toMatchObject({
      eventType: "evidence-added",
      data: { evidenceId, claimType: "proof-envelope", via: "api" },
    });
    expect(proof.provenance[0]!.sources.at(-1)).toMatchObject({
      attribution: "Reported by Writermark",
      supplier: { kind: "issuer", name: "Writermark", issuerId: "issuer:writermark" },
      approvedAt,
      links: [{ host: "writermark.example", label: "Audit trail" }],
    });
    await expectEvidenceError(
      reviewEvidence(d, { proofId, evidenceId, userId: author.userId, decision: "decline" }),
      "not-pending",
    );
    expect(await listPendingEvidence(d, author.userId)).toEqual([]);
  });

  it("keeps declined submissions private and final", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, TEXT);
    const { evidenceId } = await addEvidence(d, {
      proofId,
      userId: author.userId,
      via: "api",
      submission: documentation(),
    });
    await reviewEvidence(d, { proofId, evidenceId, userId: author.userId, decision: "decline" });
    const proof = await publicProof(proofId, author.userId);
    expect(proof.evidence.map((e) => e.id)).not.toContain(evidenceId);
    expect(proof.pendingEvidence).toEqual([]);
    expect(proof.events.map((e) => e.eventType)).toEqual(["registered"]);
    await expectEvidenceError(
      reviewEvidence(d, { proofId, evidenceId, userId: author.userId, decision: "approve" }),
      "not-pending",
    );
    // A declined submission may be sent again.
    expect(
      (await addEvidence(d, { proofId, userId: author.userId, via: "api", submission: documentation() }))
        .status,
    ).toBe("pending_approval");
  });

  it("refuses mismatched envelopes, drafts, withdrawn records and floods", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, TEXT);
    await expectEvidenceError(
      addEvidence(d, {
        proofId,
        userId: author.userId,
        via: "author",
        submission: { kind: "envelope", envelope: await envelopeFor("A different essay.") },
      }),
      "mismatch",
    );
    await expectEvidenceError(
      addEvidence(d, {
        proofId: "AU-ZZZZZZ",
        userId: author.userId,
        via: "author",
        submission: documentation(),
      }),
      "not-found",
    );

    for (let i = 0; i < MAX_PENDING_EVIDENCE; i++) {
      await addEvidence(d, {
        proofId,
        userId: author.userId,
        via: "api",
        submission: documentation(`https://jane.example/notes/${i}`),
      });
    }
    await expectEvidenceError(
      addEvidence(d, { proofId, userId: author.userId, via: "api", submission: documentation() }),
      "pending-limit",
    );

    const { proofId: draftId } = await prepareVersion(d, {
      userId: author.userId,
      profile: author.profile,
      workPublicId: (await publicProof(proofId)).work.publicId,
      registration: valid(await sampleInput(`${TEXT} Revised.`)),
    });
    await expectEvidenceError(
      addEvidence(d, { proofId: draftId, userId: author.userId, via: "author", submission: documentation() }),
      "not-registered",
    );

    const [pending] = await listPendingEvidence(d, author.userId);
    await withdrawRecord(d, { proofId, userId: author.userId, reason: "author-request" });
    await expectEvidenceError(
      addEvidence(d, { proofId, userId: author.userId, via: "author", submission: documentation() }),
      "not-registered",
    );
    await expectEvidenceError(
      reviewEvidence(d, {
        proofId,
        evidenceId: pending!.evidenceId,
        userId: author.userId,
        decision: "approve",
      }),
      "not-registered",
    );
    await reviewEvidence(d, {
      proofId,
      evidenceId: pending!.evidenceId,
      userId: author.userId,
      decision: "decline",
    });
    // Withdrawn records drop out of the approval queue.
    expect(await listPendingEvidence(d, author.userId)).toEqual([]);
  });

  it("revokes later additions, never what the author attested to", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, TEXT);
    const { evidenceId } = await addEvidence(d, {
      proofId,
      userId: author.userId,
      via: "author",
      submission: documentation(),
    });
    const disclosure = (await publicProof(proofId)).evidence.find(
      (e) => e.claimType === "creation-disclosure",
    )!;
    await expectEvidenceError(
      revokeEvidence(d, { proofId, evidenceId: disclosure.id, userId: author.userId }),
      "not-revocable",
    );
    await expectEvidenceError(
      revokeEvidence(d, { proofId, evidenceId: "not-a-uuid", userId: author.userId }),
      "not-found",
    );

    await revokeEvidence(d, { proofId, evidenceId, userId: author.userId, note: "  Wrong link.  " });
    const proof = await publicProof(proofId);
    expect(proof.evidence.find((e) => e.id === evidenceId)).toMatchObject({
      status: "revoked",
      revocationReason: "Wrong link.",
    });
    expect(proof.events.at(-1)).toMatchObject({
      eventType: "evidence-revoked",
      data: { evidenceId, claimType: "documentation", note: "Wrong link." },
    });
    await expectEvidenceError(
      revokeEvidence(d, { proofId, evidenceId, userId: author.userId }),
      "not-revocable",
    );
    // A revoked link can be added again, as a new dated claim.
    await addEvidence(d, { proofId, userId: author.userId, via: "author", submission: documentation() });
  });

  it("builds a provenance history across versions, hiding private ones from readers", async () => {
    const author = await createAuthor(d);
    const texts = [TEXT, `${TEXT} Second draft.`, `${TEXT} Third draft.`];
    const v1 = await prepareRegistration(d, {
      userId: author.userId,
      profile: author.profile,
      registration: valid({
        ...(await sampleInput(texts[0])),
        envelopesJson: [JSON.stringify(await envelopeFor(texts[0]!, "Platform A"))],
      }),
    });
    await finalizeRegistration(d, { proofId: v1.proofId, userId: author.userId, typedName: "Jane Smith" });

    const nextVersion = async (text: string, envelopes: ProofEnvelope[] = []) => {
      const input = await sampleInput(text);
      const { proofId } = await prepareVersion(d, {
        userId: author.userId,
        profile: author.profile,
        workPublicId: v1.workId,
        registration: valid({ ...input, envelopesJson: envelopes.map((e) => JSON.stringify(e)) }),
      });
      await finalizeRegistration(d, { proofId, userId: author.userId, typedName: "Jane Smith" });
      return proofId;
    };
    const v2 = await nextVersion(texts[1]!);
    await addEvidence(d, { proofId: v2, userId: author.userId, via: "author", submission: documentation() });
    const v3 = await nextVersion(texts[2]!, [await envelopeFor(texts[2]!, "Platform B")]);

    const history = (await publicProof(v3)).provenance.map(({ version, sources }) => ({
      proofId: version.proofId,
      sources: sources.map((s) => `${s.attribution}${s.addedVia === "registration" ? "" : " (added)"}`),
    }));
    expect(history).toEqual([
      { proofId: v1.proofId, sources: ["Author supplied", "Reported by Platform A"] },
      { proofId: v2, sources: ["Author supplied", "Author supplied (added)"] },
      { proofId: v3, sources: ["Author supplied", "Reported by Platform B"] },
    ]);

    await d.update(proofRecords).set({ visibility: "private" }).where(eq(proofRecords.publicId, v2));
    expect((await publicProof(v3)).versions.map((v) => v.proofId)).toEqual([v1.proofId, v3]);
    expect((await publicProof(v3, author.userId)).versions).toHaveLength(3);
  });
});
