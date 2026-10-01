import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proofRecords, recordEvents } from "@/db/schema";
import { getProofStatus, getPublicProof } from "@/lib/proof";
import {
  finalizeRegistration,
  prepareRegistration,
  prepareVersion,
  withdrawRecord,
} from "@/lib/registration";
import {
  changeEvidencePreset,
  changeRecordAccess,
  parseAccessChoice,
  publicAccess,
  releaseDueEmbargoes,
  type AccessChoice,
} from "@/lib/visibility";
import { createAuthor, registerWork, sampleInput, testDatabase, valid } from "./helpers";

const db = testDatabase();
const HOUR = 3_600_000;

describe("parseAccessChoice", () => {
  it("reads a scheduled release only for private records", () => {
    const form = new FormData();
    form.set("visibility", "private");
    form.set("release", "scheduled");
    form.set("embargoUntil", "2026-10-15T09:00:00.000Z");
    form.set("showFingerprint", "on");
    expect(parseAccessChoice(form)).toEqual({
      visibility: "private",
      embargoUntil: new Date("2026-10-15T09:00:00.000Z"),
      embargoShowsFingerprint: true,
    });
    form.set("visibility", "public");
    expect(parseAccessChoice(form)).toEqual({
      visibility: "public",
      embargoUntil: null,
      embargoShowsFingerprint: false,
    });
    form.set("visibility", "secret");
    expect(parseAccessChoice(form)).toBeNull();
  });

  it("maps records to what visitors see", () => {
    const base = { publishedAt: null, embargoUntil: null };
    expect(publicAccess({ ...base, visibility: "public", publishedAt: new Date() })).toBe("full");
    expect(publicAccess({ ...base, visibility: "unlisted", publishedAt: new Date() })).toBe("full");
    expect(publicAccess({ ...base, visibility: "private" })).toBe("private");
    expect(publicAccess({ ...base, visibility: "private", embargoUntil: new Date() })).toBe("embargoed");
    expect(publicAccess({ ...base, visibility: "private", publishedAt: new Date() })).toBe("restricted");
  });
});

describe.skipIf(!db)("record visibility", () => {
  const d = db!;

  beforeEach(async () => {
    vi.stubEnv("AUTHORO_ALL_PRO", "true");
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await d.$client.end();
  });

  async function register(access: AccessChoice, text?: string, now = new Date()) {
    const author = await createAuthor(d, `jane-${crypto.randomUUID().slice(0, 8)}`);
    const { proofId } = await prepareRegistration(d, {
      userId: author.userId,
      profile: author.profile,
      registration: valid(await sampleInput(text)),
    });
    await finalizeRegistration(d, { proofId, userId: author.userId, typedName: "Jane Smith", access, now });
    return { author, proofId };
  }

  async function record(proofId: string) {
    const [row] = await d.select().from(proofRecords).where(eq(proofRecords.publicId, proofId));
    return row!;
  }

  async function events(proofId: string) {
    const { id } = await record(proofId);
    return (
      await d
        .select({ type: recordEvents.eventType, data: recordEvents.data, actor: recordEvents.actorUserId })
        .from(recordEvents)
        .where(eq(recordEvents.proofRecordId, id))
        .orderBy(recordEvents.id)
    ).map(({ type, data, actor }) => ({ type, actor, ...(data as Record<string, unknown>) }));
  }

  const embargo = (until: Date, showFingerprint = false): AccessChoice => ({
    visibility: "private",
    embargoUntil: until,
    embargoShowsFingerprint: showFingerprint,
  });

  it("publishes public records at registration and keeps private ones unpublished", async () => {
    const { proofId: open } = await register({
      visibility: "public",
      embargoUntil: null,
      embargoShowsFingerprint: false,
    });
    const publicRecord = await record(open);
    expect(publicRecord.publishedAt).toEqual(publicRecord.registeredAt);

    const { proofId: closed } = await register(
      { visibility: "private", embargoUntil: null, embargoShowsFingerprint: false },
      "A private essay.",
    );
    expect(await record(closed)).toMatchObject({ visibility: "private", publishedAt: null });
    expect(await getPublicProof(d, closed)).toEqual({
      kind: "sealed",
      access: "private",
      proofId: closed,
      sealed: null,
    });
    expect(await events(closed)).toMatchObject([
      { type: "registered", visibility: "private", embargoUntil: null },
    ]);
  });

  it("needs Pro for anything but a public record, at registration and later", async () => {
    vi.stubEnv("AUTHORO_ALL_PRO", "false");
    await expect(
      register({ visibility: "unlisted", embargoUntil: null, embargoShowsFingerprint: false }),
    ).rejects.toMatchObject({ code: "plan-required" });

    const author = await createAuthor(d, "sam");
    const proofId = await registerWork(d, author);
    await expect(
      changeRecordAccess(d, {
        proofId,
        userId: author.userId,
        choice: { visibility: "private", embargoUntil: null, embargoShowsFingerprint: false },
        confirmedRestriction: true,
      }),
    ).rejects.toMatchObject({ code: "plan-required" });
    // The preset is free.
    expect(await changeEvidencePreset(d, { proofId, userId: author.userId, preset: "minimal" })).toEqual({
      changed: true,
    });
  });

  it("validates embargo times", async () => {
    const now = new Date();
    await expect(register(embargo(new Date(now.getTime() + 60_000)), undefined, now)).rejects.toMatchObject({
      code: "invalid-access",
    });
    await expect(
      register(embargo(new Date(now.getTime() + 11 * 365 * 24 * HOUR)), undefined, now),
    ).rejects.toMatchObject({ code: "invalid-access" });
    await expect(
      register({
        visibility: "public",
        embargoUntil: new Date(now.getTime() + HOUR),
        embargoShowsFingerprint: false,
      }),
    ).rejects.toMatchObject({ code: "invalid-access" });
  });

  it("shows an embargoed record's registration, release time and issuer count, and its fingerprint only if allowed", async () => {
    const until = new Date(Date.now() + 24 * HOUR);
    const { proofId } = await register(embargo(until));
    const sealed = await getPublicProof(d, proofId);
    expect(sealed).toMatchObject({
      kind: "sealed",
      access: "embargoed",
      sealed: { embargoUntil: until, fingerprint: null, attestationHash: null, issuerCount: 0 },
    });
    if (sealed?.kind !== "sealed" || !sealed.sealed) throw new Error("expected a sealed record");
    expect(sealed.sealed.events.map((event) => event.eventType)).toEqual(["registered"]);

    const { proofId: shown } = await register(embargo(until, true), "Another embargoed essay.");
    expect(await getPublicProof(d, shown)).toMatchObject({
      sealed: { fingerprint: { versionNumber: 1, contentHash: expect.stringMatching(/^sha256:/) } },
    });
    expect(await getProofStatus(d, shown)).toMatchObject({ access: "embargoed", released: null });
  });

  it("releases a due embargo on the next read, as of its scheduled time", async () => {
    const until = new Date(Date.now() + HOUR);
    const { proofId, author } = await register(embargo(until));
    const later = new Date(until.getTime() + HOUR);

    const proof = await getPublicProof(d, proofId, null, later);
    expect(proof).toMatchObject({
      kind: "record",
      access: "full",
      released: { proofId, scheduledFor: until, owner: { email: `${author.userId}@example.com` } },
    });
    expect(await record(proofId)).toMatchObject({
      visibility: "public",
      publishedAt: until,
      embargoUntil: null,
    });
    // Released once: the next read finds nothing to release.
    expect(await getPublicProof(d, proofId, null, later)).toMatchObject({ released: null });
    expect(await events(proofId)).toMatchObject([
      { type: "registered" },
      { type: "embargo-lifted", early: false, to: "public", actor: null },
    ]);
  });

  it("releases due embargoes in bulk for the cron", async () => {
    const until = new Date(Date.now() + HOUR);
    const { proofId } = await register(embargo(until));
    await register(embargo(new Date(until.getTime() + 24 * HOUR)), "Not due yet.");
    const released = await releaseDueEmbargoes(d, { now: new Date(until.getTime() + 1000) });
    expect(released.map((item) => item.proofId)).toEqual([proofId]);
    expect(await releaseDueEmbargoes(d, { now: new Date(until.getTime() + 2000) })).toEqual([]);
  });

  it("records every embargo change, and an early release", async () => {
    const until = new Date(Date.now() + 24 * HOUR);
    const { proofId, author } = await register(embargo(until));
    const userId = author.userId;
    const extended = new Date(until.getTime() + 24 * HOUR);
    await changeRecordAccess(d, { proofId, userId, choice: embargo(extended) });
    await changeRecordAccess(d, { proofId, userId, choice: embargo(extended, true) });
    expect(await changeRecordAccess(d, { proofId, userId, choice: embargo(extended, true) })).toEqual({
      changed: false,
    });
    await changeRecordAccess(d, {
      proofId,
      userId,
      choice: { visibility: "public", embargoUntil: null, embargoShowsFingerprint: false },
    });
    const history = await events(proofId);
    expect(history.map((event) => event.type)).toEqual([
      "registered",
      "embargo-changed",
      "embargo-changed",
      "embargo-lifted",
    ]);
    expect(history[1]).toMatchObject({ actor: userId, fingerprintShown: false });
    expect(new Date(history[1]!.to as string)).toEqual(extended);
    expect(history[2]).toMatchObject({ fingerprintShown: true });
    expect(history[3]).toMatchObject({ early: true, to: "public", actor: userId });
    const published = await record(proofId);
    expect(published.publishedAt!.getTime()).toBeLessThan(extended.getTime());
  });

  it("cancels a scheduled release and keeps the record private", async () => {
    const { proofId, author } = await register(embargo(new Date(Date.now() + 24 * HOUR)));
    await changeRecordAccess(d, {
      proofId,
      userId: author.userId,
      choice: { visibility: "private", embargoUntil: null, embargoShowsFingerprint: false },
    });
    expect(await record(proofId)).toMatchObject({
      visibility: "private",
      embargoUntil: null,
      publishedAt: null,
    });
    expect(await getPublicProof(d, proofId)).toMatchObject({ access: "private" });
    expect((await events(proofId)).at(-1)).toMatchObject({ type: "embargo-changed", to: null });
  });

  it("restricts a published record without erasing its provenance", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author);
    const userId = author.userId;
    const restrict = { visibility: "private", embargoUntil: null, embargoShowsFingerprint: false } as const;
    await expect(changeRecordAccess(d, { proofId, userId, choice: restrict })).rejects.toMatchObject({
      code: "invalid",
    });
    // A published record can't be embargoed as if it had never been seen.
    await expect(
      changeRecordAccess(d, { proofId, userId, choice: embargo(new Date(Date.now() + 24 * HOUR)) }),
    ).rejects.toMatchObject({ code: "invalid" });
    await changeRecordAccess(d, { proofId, userId, choice: restrict, confirmedRestriction: true });

    const sealed = await getPublicProof(d, proofId);
    if (sealed?.kind !== "sealed" || !sealed.sealed) throw new Error("expected a sealed record");
    expect(sealed.access).toBe("restricted");
    expect(sealed.sealed).toMatchObject({
      status: "registered",
      previousVisibility: "public",
      fingerprint: { versionNumber: 1 },
      attestationHash: expect.stringMatching(/^sha256:/),
      issuerCount: null,
    });
    expect(sealed.sealed.restrictedAt).toBeInstanceOf(Date);
    expect(sealed.sealed.events.map((event) => event.eventType)).toEqual([
      "registered",
      "visibility-changed",
    ]);

    // Making it public again is free and recorded too.
    vi.stubEnv("AUTHORO_ALL_PRO", "false");
    await changeRecordAccess(d, {
      proofId,
      userId,
      choice: { visibility: "public", embargoUntil: null, embargoShowsFingerprint: false },
    });
    expect((await events(proofId)).at(-1)).toMatchObject({
      type: "visibility-changed",
      from: "private",
      to: "public",
      firstPublished: false,
    });
  });

  it("records preset changes", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author);
    await changeEvidencePreset(d, { proofId, userId: author.userId, preset: "minimal" });
    expect(await changeEvidencePreset(d, { proofId, userId: author.userId, preset: "minimal" })).toEqual({
      changed: false,
    });
    expect((await events(proofId)).at(-1)).toMatchObject({
      type: "evidence-disclosure-changed",
      from: "standard",
      to: "minimal",
      actor: author.userId,
    });
  });

  it("only lets the owner change a registered record, and nothing once it's withdrawn", async () => {
    const author = await createAuthor(d);
    const other = await createAuthor(d, "sam");
    const proofId = await registerWork(d, author);
    await expect(
      changeEvidencePreset(d, { proofId, userId: other.userId, preset: "minimal" }),
    ).rejects.toMatchObject({ code: "not-found" });
    await withdrawRecord(d, { proofId, userId: author.userId, reason: "author-request" });
    await expect(
      changeEvidencePreset(d, { proofId, userId: author.userId, preset: "minimal" }),
    ).rejects.toMatchObject({ code: "not-registered" });
  });

  it("cancels the schedule when an embargoed record is withdrawn", async () => {
    const { proofId, author } = await register(embargo(new Date(Date.now() + 24 * HOUR)));
    await withdrawRecord(d, { proofId, userId: author.userId, reason: "erroneous-submission" });
    expect(await record(proofId)).toMatchObject({
      status: "withdrawn",
      embargoUntil: null,
      visibility: "private",
    });
    expect(await getPublicProof(d, proofId)).toMatchObject({ access: "private", sealed: null });
  });

  it("lists only public versions, and the one being viewed, to visitors", async () => {
    const { proofId: v1, author } = await register({
      visibility: "public",
      embargoUntil: null,
      embargoShowsFingerprint: false,
    });
    const [{ workId }] = await d.execute<{ workId: string }>(
      sql`select w.public_id as "workId" from works w where w.owner_id = ${author.userId}`,
    );
    const { proofId: v2 } = await prepareVersion(d, {
      userId: author.userId,
      profile: author.profile,
      workPublicId: workId!,
      registration: valid(await sampleInput("The second version.")),
    });
    await finalizeRegistration(d, {
      proofId: v2,
      userId: author.userId,
      typedName: "Jane Smith",
      access: { visibility: "unlisted", embargoUntil: null, embargoShowsFingerprint: false },
    });
    const listed = async (proofId: string, viewer?: string) => {
      const proof = await getPublicProof(d, proofId, viewer);
      if (proof?.kind !== "record") throw new Error("expected a record");
      return proof.versions.map((version) => version.proofId);
    };
    expect(await listed(v1)).toEqual([v1]);
    expect(await listed(v2)).toEqual([v1, v2]);
    expect(await listed(v1, author.userId)).toEqual([v1, v2]);
  });
});
