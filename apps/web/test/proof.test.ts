import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { proofRecords } from "@/db/schema";
import { getMetricTotals, getProofStatus, getPublicProof, incrementMetric, isLikelyBot } from "@/lib/proof";
import { prepareRegistration } from "@/lib/registration";
import { createAuthor, registerWork, sampleInput, testDatabase, valid } from "./helpers";

const db = testDatabase();

describe("isLikelyBot", () => {
  it("treats crawlers, unfurlers and missing user agents as bots", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isLikelyBot("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(
      isLikelyBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15"),
    ).toBe(false);
  });
});

describe.skipIf(!db)("public proof records", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  it("returns the full public record for a registered version", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author);
    const proof = await getPublicProof(d, proofId);
    expect(proof?.kind).toBe("record");
    if (proof?.kind !== "record") return;
    expect(proof.isOwner).toBe(false);
    expect(proof.author).toEqual({ displayName: "Jane Smith", handle: "jane", isPublic: true });
    expect(proof.evidence.map((e) => e.claimType)).toEqual(["creation-disclosure"]);
    expect(proof.authorAttestation?.statementVersion).toBe("1.0");
    expect(proof.events.map((e) => e.eventType)).toEqual(["registered"]);
    expect(proof.versions).toMatchObject([{ proofId, versionNumber: 1, status: "registered" }]);
    expect(await getPublicProof(d, proofId, author.userId)).toMatchObject({ isOwner: true });
  });

  it("hides unattested drafts except to point their owner at attestation", async () => {
    const author = await createAuthor(d);
    const { proofId } = await prepareRegistration(d, {
      userId: author.userId,
      profile: author.profile,
      registration: valid(await sampleInput()),
    });
    expect(await getPublicProof(d, proofId)).toBeNull();
    expect(await getPublicProof(d, proofId, author.userId)).toEqual({ kind: "pending", proofId });
    expect(await getPublicProof(d, "AU-000000")).toBeNull();
  });

  it("shows visitors only the surviving provenance of a restricted record", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author);
    await d.update(proofRecords).set({ visibility: "private" }).where(eq(proofRecords.publicId, proofId));
    expect(await getPublicProof(d, proofId)).toMatchObject({ kind: "sealed", access: "restricted" });
    expect(await getPublicProof(d, proofId, author.userId)).toMatchObject({
      kind: "record",
      access: "restricted",
    });
  });

  it("counts daily metrics and totals them", async () => {
    const author = await createAuthor(d);
    const proofId = await registerWork(d, author);
    const status = await getProofStatus(d, proofId);
    expect(status).toMatchObject({ status: "registered", visibility: "public" });
    const id = status!.id;
    const day1 = new Date("2026-09-30T12:00:00Z");
    const day2 = new Date("2026-10-01T12:00:00Z");
    await incrementMetric(d, id, "markImpressions", day1);
    await incrementMetric(d, id, "markImpressions", day1);
    await incrementMetric(d, id, "markClicks", day1);
    await incrementMetric(d, id, "markImpressions", day2);
    await incrementMetric(d, id, "pageViews", day2);
    const totals = await getMetricTotals(d, [id]);
    expect(totals.get(id)).toEqual({ markImpressions: 3, markClicks: 1, pageViews: 1, verifications: 0 });
    expect(await getMetricTotals(d, [])).toEqual(new Map());
  });
});
