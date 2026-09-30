import "dotenv/config";
import { generateProofId, generateWorkId, hashCanonicalJson } from "@authoro/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import {
  attestations,
  auditEvents,
  authorAttestations,
  authorProfiles,
  issuers,
  proofRecords,
  recordEvents,
  user,
  works,
  workVersions,
} from "@/db/schema";

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDatabase(url, { max: 1 }) : null;
const hash = (char: string) => `sha256:${char.repeat(64)}`;

async function expectRejected(promise: Promise<unknown>, message: RegExp) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, "expected the database to reject the statement").not.toBeNull();
  // Drizzle wraps driver errors; the Postgres message is on the cause.
  const cause = (error as { cause?: { message?: string } }).cause;
  expect(cause?.message ?? String(error)).toMatch(message);
}

describe.skipIf(!db)("database integrity rules", () => {
  const d = db!;

  async function seedPendingRecord() {
    const userId = `user_${crypto.randomUUID()}`;
    await d.insert(user).values({ id: userId, name: "Jane Smith", email: `${userId}@example.com` });
    const [profile] = await d
      .insert(authorProfiles)
      .values({ userId, handle: `jane-${userId.slice(-8)}`, displayName: "Jane Smith" })
      .returning();
    const [work] = await d
      .insert(works)
      .values({
        publicId: generateWorkId(),
        ownerId: userId,
        authorProfileId: profile!.id,
        title: "The Future of Independent Software",
        workType: "article",
      })
      .returning();
    const [version] = await d
      .insert(workVersions)
      .values({
        workId: work!.id,
        versionNumber: 1,
        title: work!.title,
        authorDisplayName: "Jane Smith",
        contentHash: hash("a"),
        textHash: hash("b"),
        textCanonicalization: "authoro-text/1",
        mediaType: "text/html",
        byteLength: 1024,
      })
      .returning();
    const [record] = await d
      .insert(proofRecords)
      .values({ publicId: generateProofId(), workVersionId: version!.id })
      .returning();
    const payload = { methods: ["ai-assisted"], aiUses: ["editing"], aiTools: ["Claude"] };
    const [attestation] = await d
      .insert(attestations)
      .values({
        workVersionId: version!.id,
        evidenceClass: "self",
        claimType: "creation-disclosure",
        submittedByUserId: userId,
        payload,
        payloadHash: await hashCanonicalJson(payload),
      })
      .returning();
    return { userId, work: work!, version: version!, record: record!, attestation: attestation! };
  }

  async function register(recordId: string) {
    await d
      .update(proofRecords)
      .set({ status: "registered", registeredAt: new Date() })
      .where(eq(proofRecords.id, recordId));
  }

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user", issuers, audit_events RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  it("allows editing and deleting a version while it awaits attestation", async () => {
    const { version, record, attestation } = await seedPendingRecord();
    await d.update(workVersions).set({ title: "Corrected title" }).where(eq(workVersions.id, version.id));
    await d.delete(attestations).where(eq(attestations.id, attestation.id));
    await d.delete(proofRecords).where(eq(proofRecords.id, record.id));
    await d.delete(workVersions).where(eq(workVersions.id, version.id));
    expect(await d.select().from(workVersions).where(eq(workVersions.id, version.id))).toHaveLength(0);
  });

  it("freezes a version once registered", async () => {
    const { version, record } = await seedPendingRecord();
    await register(record.id);
    await expectRejected(
      d
        .update(workVersions)
        .set({ contentHash: hash("c") })
        .where(eq(workVersions.id, version.id)),
      /registered and immutable/,
    );
    await expectRejected(
      d.delete(workVersions).where(eq(workVersions.id, version.id)),
      /registered and immutable/,
    );
  });

  it("only moves proof records forward", async () => {
    const { record } = await seedPendingRecord();
    await expectRejected(
      d
        .update(proofRecords)
        .set({ status: "withdrawn", withdrawnAt: new Date(), registeredAt: new Date() })
        .where(eq(proofRecords.id, record.id)),
      /never registered/,
    );
    await register(record.id);
    await expectRejected(d.delete(proofRecords).where(eq(proofRecords.id, record.id)), /cannot be deleted/);
    await expectRejected(
      d
        .update(proofRecords)
        .set({ status: "pending_attestation", registeredAt: null })
        .where(eq(proofRecords.id, record.id)),
      /cannot return to pending/,
    );
    await expectRejected(
      d.update(proofRecords).set({ publicId: generateProofId() }).where(eq(proofRecords.id, record.id)),
      /identity/,
    );
    await expectRejected(
      d
        .update(proofRecords)
        .set({ registeredAt: new Date(0) })
        .where(eq(proofRecords.id, record.id)),
      /registration time/,
    );
    // Visibility may change; withdrawal is final.
    await d.update(proofRecords).set({ visibility: "unlisted" }).where(eq(proofRecords.id, record.id));
    await d
      .update(proofRecords)
      .set({ status: "withdrawn", withdrawnAt: new Date(), withdrawnReason: "Author request" })
      .where(eq(proofRecords.id, record.id));
    await expectRejected(
      d.update(proofRecords).set({ visibility: "public" }).where(eq(proofRecords.id, record.id)),
      /withdrawn and final/,
    );
  });

  it("keeps attestation claims immutable and revocation final", async () => {
    const { record, attestation, userId } = await seedPendingRecord();
    await register(record.id);
    await expectRejected(
      d
        .update(attestations)
        .set({ payload: { methods: ["manual"] } })
        .where(eq(attestations.id, attestation.id)),
      /is immutable/,
    );
    await expectRejected(
      d.delete(attestations).where(eq(attestations.id, attestation.id)),
      /revoke it instead/,
    );
    await d.update(attestations).set({ status: "disputed" }).where(eq(attestations.id, attestation.id));
    await d.update(attestations).set({ status: "active" }).where(eq(attestations.id, attestation.id));
    await d
      .update(attestations)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedByUserId: userId,
        revocationReason: "erroneous-submission",
      })
      .where(eq(attestations.id, attestation.id));
    await expectRejected(
      d.update(attestations).set({ status: "active" }).where(eq(attestations.id, attestation.id)),
      /revoked and final/,
    );
  });

  it("enforces hash formats and self-attestations without issuers", async () => {
    const { version } = await seedPendingRecord();
    await expectRejected(
      d.insert(workVersions).values({
        workId: version.workId,
        versionNumber: 2,
        title: "x",
        authorDisplayName: "x",
        contentHash: "md5:abc",
        mediaType: "text/plain",
        byteLength: 1,
      }),
      /content_hash_format/,
    );
    const [issuer] = await d
      .insert(issuers)
      .values({ slug: "writermark", name: "Writermark", kind: "platform" })
      .returning();
    const payload = { methods: ["manual"] };
    await expectRejected(
      d.insert(attestations).values({
        workVersionId: version.id,
        evidenceClass: "self",
        claimType: "creation-disclosure",
        issuerId: issuer!.id,
        payload,
        payloadHash: await hashCanonicalJson(payload),
      }),
      /self_has_no_issuer/,
    );
  });

  it("makes author attestations, record events and audit events append-only", async () => {
    const { record, version, userId } = await seedPendingRecord();
    const [authorAttestation] = await d
      .insert(authorAttestations)
      .values({
        workVersionId: version.id,
        userId,
        statementVersion: "1.0",
        legalNameHash: hash("d"),
        legalNameSalt: "salt",
        payload: { type: "author-attestation" },
        attestationHash: hash("e"),
        signedAt: new Date(),
      })
      .returning();
    const [event] = await d
      .insert(recordEvents)
      .values({ proofRecordId: record.id, eventType: "registered", actorUserId: userId })
      .returning();
    const [audit] = await d
      .insert(auditEvents)
      .values({ actorType: "user", actorId: userId, action: "proof.register" })
      .returning();

    await expectRejected(
      d
        .update(authorAttestations)
        .set({ statementVersion: "9.9" })
        .where(eq(authorAttestations.id, authorAttestation!.id)),
      /append-only/,
    );
    await expectRejected(d.delete(recordEvents).where(eq(recordEvents.id, event!.id)), /append-only/);
    await expectRejected(
      d.update(auditEvents).set({ action: "x" }).where(eq(auditEvents.id, audit!.id)),
      /append-only/,
    );
  });
});
