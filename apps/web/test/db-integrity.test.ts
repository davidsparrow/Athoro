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
    const now = new Date();
    await d
      .update(proofRecords)
      .set({ status: "registered", registeredAt: now, publishedAt: now })
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

  it("keeps a published record's provenance when its visibility changes", async () => {
    const { record } = await seedPendingRecord();
    const events = async () =>
      (
        await d
          .select({ type: recordEvents.eventType, data: recordEvents.data })
          .from(recordEvents)
          .where(eq(recordEvents.proofRecordId, record.id))
          .orderBy(recordEvents.id)
      ).map(({ type, data }) => ({ type, ...(data as Record<string, unknown>) }));

    // Registering a public record publishes it.
    await expectRejected(
      d
        .update(proofRecords)
        .set({ status: "registered", registeredAt: new Date() })
        .where(eq(proofRecords.id, record.id)),
      /proof_records_published_when_visible/,
    );
    await register(record.id);
    // Drafts and registration itself aren't logged here; the application writes `registered`.
    expect(await events()).toEqual([]);

    // Restricting keeps the publication time, which never changes.
    await d.update(proofRecords).set({ visibility: "private" }).where(eq(proofRecords.id, record.id));
    await expectRejected(
      d.update(proofRecords).set({ publishedAt: null }).where(eq(proofRecords.id, record.id)),
      /publication time cannot change/,
    );
    await expectRejected(
      d.update(proofRecords).set({ publishedAt: new Date() }).where(eq(proofRecords.id, record.id)),
      /publication time cannot change/,
    );
    // A published record can't be embargoed as if it had never been seen.
    await expectRejected(
      d
        .update(proofRecords)
        .set({ embargoUntil: new Date(Date.now() + 86_400_000) })
        .where(eq(proofRecords.id, record.id)),
      /proof_records_embargo_private/,
    );
    await d
      .update(proofRecords)
      .set({ visibility: "unlisted", evidenceDisclosure: "minimal" })
      .where(eq(proofRecords.id, record.id));

    expect(await events()).toEqual([
      { type: "visibility-changed", from: "public", to: "private", firstPublished: false },
      { type: "visibility-changed", from: "private", to: "unlisted", firstPublished: false },
      { type: "evidence-disclosure-changed", from: "standard", to: "minimal" },
    ]);
  });

  it("releases embargoes only from private records that were never published", async () => {
    const { record } = await seedPendingRecord();
    const registeredAt = new Date(Date.now() - 60_000);
    const until = new Date(Date.now() + 86_400_000);
    await d
      .update(proofRecords)
      .set({ status: "registered", registeredAt, visibility: "private", embargoUntil: until })
      .where(eq(proofRecords.id, record.id));
    await expectRejected(
      d.update(proofRecords).set({ visibility: "unlisted" }).where(eq(proofRecords.id, record.id)),
      /proof_records_embargo_private/,
    );
    // Publishing a record that stays private is refused.
    await expectRejected(
      d
        .update(proofRecords)
        .set({ embargoUntil: null, publishedAt: new Date() })
        .where(eq(proofRecords.id, record.id)),
      /stays private/,
    );
    await expectRejected(
      d
        .update(proofRecords)
        .set({ visibility: "public", embargoUntil: null, publishedAt: new Date(registeredAt.getTime() - 1) })
        .where(eq(proofRecords.id, record.id)),
      /proof_records_published_after_registration/,
    );
    const later = new Date(until.getTime() + 86_400_000);
    await d.update(proofRecords).set({ embargoUntil: later }).where(eq(proofRecords.id, record.id));
    await d
      .update(proofRecords)
      .set({ visibility: "public", embargoUntil: null, publishedAt: later })
      .where(eq(proofRecords.id, record.id));

    const events = await d
      .select({ type: recordEvents.eventType, data: recordEvents.data })
      .from(recordEvents)
      .where(eq(recordEvents.proofRecordId, record.id))
      .orderBy(recordEvents.id);
    expect(events.map((event) => event.type)).toEqual(["embargo-changed", "embargo-lifted"]);
    expect(new Date((events[0]!.data as { from: string }).from)).toEqual(until);
    expect(new Date((events[0]!.data as { to: string }).to)).toEqual(later);
    expect(events[1]!.data).toMatchObject({ early: false, to: "public" });
    expect(new Date((events[1]!.data as { scheduledFor: string }).scheduledFor)).toEqual(later);
  });

  it("cancels a scheduled release when a record is withdrawn", async () => {
    const { record } = await seedPendingRecord();
    await d
      .update(proofRecords)
      .set({
        status: "registered",
        registeredAt: new Date(),
        visibility: "private",
        embargoUntil: new Date(Date.now() + 86_400_000),
      })
      .where(eq(proofRecords.id, record.id));
    await expectRejected(
      d
        .update(proofRecords)
        .set({ status: "withdrawn", withdrawnAt: new Date() })
        .where(eq(proofRecords.id, record.id)),
      /proof_records_embargo_private/,
    );
    await d
      .update(proofRecords)
      .set({ status: "withdrawn", withdrawnAt: new Date(), embargoUntil: null })
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

  async function addEvidence(
    versionId: string,
    values: Partial<typeof attestations.$inferInsert> = {},
  ): Promise<string> {
    const payload = { schema: "authoro-documentation/1.0", links: [{ url: "https://jane.example/notes" }] };
    const [row] = await d
      .insert(attestations)
      .values({
        workVersionId: versionId,
        evidenceClass: "self",
        claimType: "documentation",
        payload,
        payloadHash: await hashCanonicalJson(payload),
        addedVia: "author",
        ...values,
      })
      .returning();
    return row!.id;
  }

  const setEvidence = (id: string, values: Partial<typeof attestations.$inferInsert>) =>
    d.update(attestations).set(values).where(eq(attestations.id, id));

  it("separates evidence the author attested to from evidence added later", async () => {
    const { record, version, attestation } = await seedPendingRecord();
    expect(attestation.addedVia).toBe("registration");
    await expectRejected(addEvidence(version.id), /only once it is registered/);
    await register(record.id);
    await expectRejected(addEvidence(version.id, { addedVia: "registration" }), /evidence added now/);
    const id = await addEvidence(version.id);
    await expectRejected(setEvidence(id, { addedVia: "registration" }), /is immutable/);
    await expectRejected(
      addEvidence(version.id, { status: "revoked", revokedAt: new Date() }),
      /active or awaiting/,
    );
    await expectRejected(addEvidence(version.id, { reviewedAt: new Date() }), /not been reviewed/);
  });

  it("makes evidence from an API key wait for the author's approval, decided once", async () => {
    const { record, version } = await seedPendingRecord();
    await register(record.id);
    await expectRejected(addEvidence(version.id, { addedVia: "api" }), /awaits the author's approval/);
    await expectRejected(
      addEvidence(version.id, { status: "pending_approval" }),
      /awaits the author's approval/,
    );
    const id = await addEvidence(version.id, { addedVia: "api", status: "pending_approval" });

    await expectRejected(setEvidence(id, { status: "active" }), /reviewed_at is set when/);
    await expectRejected(setEvidence(id, { reviewedAt: new Date() }), /reviewed_at is set when/);
    await expectRejected(setEvidence(id, { status: "revoked", revokedAt: new Date() }), /approve or decline/);
    await setEvidence(id, { status: "active", reviewedAt: new Date() });
    await expectRejected(setEvidence(id, { reviewedAt: new Date(0) }), /review time/);
    await expectRejected(setEvidence(id, { status: "pending_approval" }), /already public/);
    await expectRejected(setEvidence(id, { status: "declined" }), /already public/);
    await setEvidence(id, { status: "revoked", revokedAt: new Date() });

    const declined = await addEvidence(version.id, { addedVia: "api", status: "pending_approval" });
    await setEvidence(declined, { status: "declined", reviewedAt: new Date() });
    await expectRejected(setEvidence(declined, { status: "active" }), /declined and is final/);
    await expectRejected(d.delete(attestations).where(eq(attestations.id, declined)), /revoke it instead/);
  });

  it("adds and approves nothing on a withdrawn record", async () => {
    const { record, version } = await seedPendingRecord();
    await register(record.id);
    const pending = await addEvidence(version.id, { addedVia: "api", status: "pending_approval" });
    const other = await addEvidence(version.id, { addedVia: "api", status: "pending_approval" });
    await d
      .update(proofRecords)
      .set({ status: "withdrawn", withdrawnAt: new Date(), withdrawnReason: "Author request" })
      .where(eq(proofRecords.id, record.id));
    await expectRejected(addEvidence(version.id), /withdrawn record/);
    await expectRejected(
      setEvidence(pending, { status: "active", reviewedAt: new Date() }),
      /cannot be approved/,
    );
    await setEvidence(other, { status: "declined", reviewedAt: new Date() });
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
