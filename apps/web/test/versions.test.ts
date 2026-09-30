import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getMark } from "@/app/p/[proofId]/mark.svg/route";
import { proofRecords, recordEvents, works } from "@/db/schema";
import { getPublicProof } from "@/lib/proof";
import { getAuthorPage, updateAuthorProfile } from "@/lib/profiles";
import {
  discardPendingRegistration,
  finalizeRegistration,
  getWorkForNewVersion,
  prepareVersion,
  withdrawRecord,
} from "@/lib/registration";
import { createAuthor, registerWork, sampleInput, testDatabase, valid } from "./helpers";

const db = testDatabase();

describe.skipIf(!db)("versions, withdrawal and author pages", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  async function workIdOf(proofId: string) {
    const proof = await getPublicProof(d, proofId);
    if (proof?.kind !== "record") throw new Error("no record");
    return proof.work.publicId;
  }

  async function newVersion(
    author: Awaited<ReturnType<typeof createAuthor>>,
    workId: string,
    text: string,
    title?: string,
  ) {
    const input = await sampleInput(text);
    return prepareVersion(d, {
      userId: author.userId,
      profile: author.profile,
      workPublicId: workId,
      registration: valid({ ...input, work: { ...input.work, title: title ?? input.work.title } }),
    });
  }

  it("registers a second version and links the history", async () => {
    const author = await createAuthor(d);
    const v1 = await registerWork(d, author, "First draft.");
    const workId = await workIdOf(v1);

    const { proofId: v2, versionNumber } = await newVersion(
      author,
      workId,
      "Second draft.",
      "A Better Title",
    );
    expect(versionNumber).toBe(2);
    await finalizeRegistration(d, { proofId: v2, userId: author.userId, typedName: "Jane Smith" });

    const [work] = await d.select().from(works).where(eq(works.publicId, workId));
    expect(work?.title).toBe("A Better Title");

    const latest = await getPublicProof(d, v2);
    expect(latest?.kind === "record" && latest.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    const first = await getPublicProof(d, v1);
    expect(first?.kind === "record" && first.events.map((e) => e.eventType)).toEqual([
      "registered",
      "newer-version-registered",
    ]);
    expect(first?.kind === "record" && first.version.title).toBe("The Future of Independent Software");
  });

  it("allows one draft at a time and refuses unchanged content", async () => {
    const author = await createAuthor(d);
    const v1 = await registerWork(d, author, "Original.");
    const workId = await workIdOf(v1);

    await expect(newVersion(author, workId, "Original.")).rejects.toMatchObject({ code: "unchanged" });
    const draft = await newVersion(author, workId, "Revised.");
    await expect(newVersion(author, workId, "Revised again.")).rejects.toMatchObject({
      code: "draft-exists",
    });

    // Discarding the draft keeps the work and its registered version.
    await discardPendingRegistration(d, { proofId: draft.proofId, userId: author.userId });
    expect(await d.select().from(works).where(eq(works.publicId, workId))).toHaveLength(1);
    expect((await newVersion(author, workId, "Revised again.")).versionNumber).toBe(2);
  });

  it("loads an owned work's versions for the new-version form", async () => {
    const author = await createAuthor(d);
    const v1 = await registerWork(d, author, "First.");
    const workId = await workIdOf(v1);

    const ready = await getWorkForNewVersion(d, workId, author.userId);
    expect(ready).toMatchObject({
      work: { publicId: workId, workType: "essay" },
      latest: { proofId: v1, versionNumber: 1, title: "The Future of Independent Software" },
      draft: null,
      nextVersionNumber: 2,
    });

    const draft = await newVersion(author, workId, "Second.");
    const blocked = await getWorkForNewVersion(d, workId, author.userId);
    expect(blocked?.latest?.proofId).toBe(v1);
    expect(blocked?.draft).toMatchObject({ proofId: draft.proofId, versionNumber: 2 });
    await expect(newVersion(author, workId, "Third.")).rejects.toMatchObject({
      code: "draft-exists",
      proofId: draft.proofId,
    });
    await expect(newVersion(author, workId, "First.")).rejects.toMatchObject({ code: "draft-exists" });

    const other = await createAuthor(d, "other");
    expect(await getWorkForNewVersion(d, workId, other.userId)).toBeNull();
  });

  it("names the identical version when content is unchanged", async () => {
    const author = await createAuthor(d);
    const v1 = await registerWork(d, author, "Same words.");
    await expect(newVersion(author, await workIdOf(v1), "Same words.")).rejects.toMatchObject({
      code: "unchanged",
      proofId: v1,
    });
  });

  it("only lets the owner add versions", async () => {
    const author = await createAuthor(d);
    const workId = await workIdOf(await registerWork(d, author, "Mine."));
    const other = await createAuthor(d, "other");
    await expect(newVersion(other, workId, "Not mine.")).rejects.toMatchObject({ code: "not-found" });
  });

  it("withdraws registered records once, with a reason and an event", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, "To be withdrawn.");
    const other = await createAuthor(d, "other");
    await expect(withdrawRecord(d, { proofId, userId: other.userId, reason: "other" })).rejects.toMatchObject(
      {
        code: "not-found",
      },
    );

    const now = new Date("2026-10-02T09:00:00Z");
    await withdrawRecord(d, {
      proofId,
      userId: author.userId,
      reason: "incorrect-metadata",
      note: " Wrong title ",
      now,
    });
    const [record] = await d.select().from(proofRecords).where(eq(proofRecords.publicId, proofId));
    expect(record).toMatchObject({
      status: "withdrawn",
      withdrawnAt: now,
      withdrawnReason: "The record's details are wrong: Wrong title",
    });
    const events = await d.select().from(recordEvents).where(eq(recordEvents.proofRecordId, record!.id));
    expect(events.map((e) => e.eventType)).toEqual(["registered", "withdrawn"]);
    await expect(
      withdrawRecord(d, { proofId, userId: author.userId, reason: "other" }),
    ).rejects.toMatchObject({ code: "not-registered" });
  });

  it("serves a muted mark once a record is withdrawn", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author, "Marked.");
    const mark = async () =>
      (
        await getMark(new Request(`https://authoro.test/p/${proofId}/mark.svg`), {
          params: Promise.resolve({ proofId }),
        })
      ).text();
    expect(await mark()).not.toContain("withdrawn");
    await withdrawRecord(d, { proofId, userId: author.userId, reason: "author-request" });
    expect(await mark()).toContain(">withdrawn</text>");
  });

  it("lists the latest public version of each work on the author page", async () => {
    const author = await createAuthor(d);
    const v1 = await registerWork(d, author, "Essay one.");
    const workId = await workIdOf(v1);
    const { proofId: v2 } = await newVersion(author, workId, "Essay one, revised.");
    await finalizeRegistration(d, { proofId: v2, userId: author.userId, typedName: "Jane Smith" });
    await registerWork(d, author, "Essay two.");
    await newVersion(author, workId, "An unattested draft.").catch(() => undefined);

    const page = await getAuthorPage(d, "jane");
    expect(page?.profile).toMatchObject({ handle: "jane", displayName: "Jane Smith" });
    expect(page?.works).toHaveLength(2);
    const revised = page?.works.find((work) => work.workId === workId);
    expect(revised).toMatchObject({ proofId: v2, versionNumber: 2, versionCount: 2 });

    await updateAuthorProfile(d, author.userId, {
      displayName: "Jane Smith",
      bio: null,
      websiteUrl: null,
      isPublic: false,
    });
    expect(await getAuthorPage(d, "jane")).toBeNull();
    expect(await getAuthorPage(d, "nobody")).toBeNull();
  });
});
