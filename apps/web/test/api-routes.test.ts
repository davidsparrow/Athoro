import { fingerprintPastedText } from "@authoro/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as releaseEmbargoes } from "@/app/api/cron/embargoes/route";
import { POST as addEvidenceRoute } from "@/app/api/v1/proofs/[proofId]/evidence/route";
import { GET as getProof, OPTIONS as proofOptions } from "@/app/api/v1/proofs/[proofId]/route";
import { POST as verify } from "@/app/api/v1/verify/route";
import { POST as createVersion } from "@/app/api/v1/works/[workId]/versions/route";
import { GET as listWorks, POST as createWork } from "@/app/api/v1/works/route";
import { apiRateLimits, proofRecords, recordEvents, user } from "@/db/schema";
import { createApiKey } from "@/lib/api/keys";
import { PUBLIC_RATE_LIMIT } from "@/lib/api/http";
import type { EmailMessage } from "@/lib/email/send";
import { reviewEvidence } from "@/lib/evidence";
import { finalizeRegistration, prepareRegistration, withdrawRecord } from "@/lib/registration";
import { changeEvidencePreset, changeRecordAccess, type AccessChoice } from "@/lib/visibility";
import { hashIp } from "@/lib/request-ip";
import { createAuthor, registerWork, sampleInput, testDatabase, valid } from "./helpers";

const emails = vi.hoisted(() => [] as EmailMessage[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async (message: EmailMessage) => void emails.push(message)),
}));

const db = testDatabase();
const BASE = "https://authoro.test";
const TEXT = "The future of independent software is small.";

function request(path: string, init: RequestInit & { ip?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.ip ?? "198.51.100.7");
  return new Request(`${BASE}${path}`, { ...init, headers });
}

const proofParams = (proofId: string) => ({ params: Promise.resolve({ proofId }) });
const workParams = (workId: string) => ({ params: Promise.resolve({ workId }) });

describe.skipIf(!db)("API v1", () => {
  const d = db!;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await d.execute(sql`TRUNCATE "user", api_rate_limits CASCADE`);
    emails.length = 0;
  });

  afterAll(async () => {
    await d.$client.end();
  });

  describe("GET /api/v1/proofs/{id}", () => {
    it("returns the public record without private fields", async () => {
      const author = await createAuthor(d);
      const proofId = await registerWork(d, author, TEXT);
      const response = await getProof(
        request(`/api/v1/proofs/${proofId.toLowerCase()}`),
        proofParams(proofId.toLowerCase()),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("ratelimit-limit")).toBe(String(PUBLIC_RATE_LIMIT.limit));
      const body = await response.json();
      expect(body).toMatchObject({
        object: "proof",
        id: proofId,
        url: `${BASE}/p/${proofId}`,
        status: "registered",
        author: { displayName: "Jane Smith", handle: "jane" },
        version: { number: 1, textCanonicalization: "authoro-text/1" },
        authorAttestation: { statementVersion: "1.0", intact: true },
        evidence: [{ class: "self", claimType: "creation-disclosure", submittedBy: "author", intact: true }],
        mark: { svg: `${BASE}/p/${proofId}/mark.svg` },
      });
      const text = JSON.stringify(body);
      expect(text).not.toContain(author.userId);
      expect(text).not.toMatch(/salt|ownerId|userId/i);
    });

    it("reports a withdrawal with its reason", async () => {
      const author = await createAuthor(d);
      const proofId = await registerWork(d, author, TEXT);
      await withdrawRecord(d, {
        proofId,
        userId: author.userId,
        reason: "erroneous-submission",
        note: "Registered twice.",
      });
      const body = await (await getProof(request(`/api/v1/proofs/${proofId}`), proofParams(proofId))).json();
      expect(body).toMatchObject({
        status: "withdrawn",
        withdrawn: { reason: "Registered by mistake: Registered twice." },
        events: [
          { type: "registered" },
          { type: "withdrawn", reason: "erroneous-submission", note: "Registered twice." },
        ],
      });
      expect(JSON.stringify(body.events)).not.toContain(author.userId);
    });

    it("answers CORS preflights", async () => {
      const response = proofOptions();
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    });

    it("404s unknown and unattested records and 400s malformed IDs", async () => {
      expect((await getProof(request("/api/v1/proofs/AU-ZZZZZZ"), proofParams("AU-ZZZZZZ"))).status).toBe(
        404,
      );
      const bad = await getProof(request("/api/v1/proofs/hello"), proofParams("hello"));
      expect(bad.status).toBe(400);
      expect((await bad.json()).error.code).toBe("invalid_id");
    });

    it("rate limits by client IP", async () => {
      const ipKey = `ip:${await hashIp("203.0.113.9", process.env.BETTER_AUTH_SECRET!)}`;
      const nowSeconds = Math.floor(Date.now() / 1000);
      await d.insert(apiRateLimits).values({
        key: ipKey,
        windowStart: nowSeconds - (nowSeconds % PUBLIC_RATE_LIMIT.windowSeconds),
        count: PUBLIC_RATE_LIMIT.limit,
      });
      const limited = await getProof(
        request("/api/v1/proofs/AU-ZZZZZZ", { ip: "203.0.113.9" }),
        proofParams("AU-ZZZZZZ"),
      );
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await limited.json()).error.code).toBe("rate_limited");
    });
  });

  describe("visibility and evidence presets", () => {
    const get = (proofId: string) => getProof(request(`/api/v1/proofs/${proofId}`), proofParams(proofId));
    const envelope = (contentHash: string) => ({
      schema: "authoro-proof/1.1",
      issuer: { id: "issuer:writermark", name: "Writermark" },
      work: { hash: contentHash },
      evidence: { method: "continuous-composition", sessions: 3, statistics: { pasted: 0.02 } },
      links: [{ url: "https://writermark.example/reports/1", label: "Session report" }],
    });

    async function registerWith(access: AccessChoice, text = TEXT) {
      vi.stubEnv("AUTHORO_ALL_PRO", "true");
      const author = await createAuthor(d, `jane-${crypto.randomUUID().slice(0, 8)}`);
      const input = await sampleInput(text);
      const { proofId } = await prepareRegistration(d, {
        userId: author.userId,
        profile: author.profile,
        registration: valid({
          ...input,
          envelopesJson: [JSON.stringify(envelope(input.document.contentHash))],
        }),
      });
      await finalizeRegistration(d, { proofId, userId: author.userId, typedName: "Jane Smith", access });
      return { author, proofId };
    }
    const PUBLIC: AccessChoice = { visibility: "public", embargoUntil: null, embargoShowsFingerprint: false };

    it("withholds payload bodies under Minimal but keeps the hashes and who supplied them", async () => {
      const { author, proofId } = await registerWith(PUBLIC);
      await changeEvidencePreset(d, { proofId, userId: author.userId, preset: "minimal" });
      const body = await (await get(proofId)).json();
      expect(body).toMatchObject({ access: "full", evidenceDisclosure: "minimal" });
      expect(body.evidence).toMatchObject([
        {
          claimType: "creation-disclosure",
          payload: null,
          payloadWithheld: true,
          publicFields: { methods: ["ai-assisted"], links: [] },
          payloadHash: expect.stringMatching(/^sha256:/),
          intact: true,
        },
        {
          claimType: "proof-envelope",
          payload: null,
          payloadWithheld: true,
          publicFields: {
            schema: "authoro-proof/1.1",
            issuer: { id: "issuer:writermark", name: "Writermark" },
            evidence: { method: "continuous-composition" },
            links: [{ url: "https://writermark.example/reports/1" }],
          },
          signatureStatus: "unsigned",
          signed: false,
          intact: true,
        },
      ]);
      const text = JSON.stringify(body.evidence);
      expect(text).not.toContain("Copyediting only.");
      expect(text).not.toContain("sessions");
      expect(body.events.at(-1)).toMatchObject({
        type: "evidence-disclosure-changed",
        from: "standard",
        to: "minimal",
      });
    });

    it("says only that a private record exists", async () => {
      const { proofId } = await registerWith({ ...PUBLIC, visibility: "private" });
      const response = await get(proofId);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      expect(await response.json()).toEqual({
        object: "proof",
        id: proofId,
        url: `${BASE}/p/${proofId}`,
        access: "private",
        visibility: "private",
      });
    });

    it("shows an embargo's dates and issuer count, and a restricted record's provenance", async () => {
      const until = new Date(Date.now() + 24 * 3_600_000);
      const { proofId: sealed } = await registerWith({
        visibility: "private",
        embargoUntil: until,
        embargoShowsFingerprint: false,
      });
      const embargoed = await (await get(sealed)).json();
      expect(embargoed).toMatchObject({
        access: "embargoed",
        status: "registered",
        embargo: { until: until.toISOString(), issuerCount: 1 },
        version: null,
        events: [{ type: "registered", visibility: "private", embargoUntil: until.toISOString() }],
      });
      expect(JSON.stringify(embargoed)).not.toMatch(/Future of Independent|Writermark|Jane/);

      const { author, proofId } = await registerWith(PUBLIC, "Restricted later.");
      await changeRecordAccess(d, {
        proofId,
        userId: author.userId,
        choice: { ...PUBLIC, visibility: "private" },
        confirmedRestriction: true,
      });
      const restricted = await (await get(proofId)).json();
      expect(restricted).toMatchObject({
        access: "restricted",
        status: "registered",
        publishedAt: expect.any(String),
        restrictedAt: expect.any(String),
        version: { number: 1, contentHash: expect.stringMatching(/^sha256:/) },
        attestationHash: expect.stringMatching(/^sha256:/),
        events: [{ type: "registered" }, { type: "visibility-changed", from: "public", to: "private" }],
      });
      expect(JSON.stringify(restricted)).not.toMatch(/Future of Independent|Writermark|Copyediting/);

      // The fingerprint a restricted record keeps can still be checked.
      const fingerprint = await fingerprintPastedText("Restricted later.");
      const check = await verify(
        request("/api/v1/verify", {
          method: "POST",
          body: JSON.stringify({ proofId, contentHash: fingerprint.contentHash }),
        }),
      );
      expect(await check.json()).toMatchObject({
        proof: { id: proofId, access: "restricted", status: "registered" },
        valid: true,
        match: { matched: true, method: "exact-bytes", sameVersion: true },
      });
    });

    it("releases due embargoes from the cron and emails their authors", async () => {
      const { proofId } = await registerWith({
        visibility: "private",
        embargoUntil: new Date(Date.now() + 10 * 60_000),
        embargoShowsFingerprint: false,
      });
      // Pretend the release time has passed.
      await d.execute(
        sql`update proof_records set embargo_until = registered_at where public_id = ${proofId}`,
      );
      const cron = (authorization?: string) =>
        releaseEmbargoes(request("/api/cron/embargoes", { headers: authorization ? { authorization } : {} }));
      expect((await cron("Bearer whatever")).status).toBe(404);
      vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
      expect((await cron("Bearer wrong")).status).toBe(404);
      const response = await cron("Bearer cron-secret-for-tests");
      expect(await response.json()).toEqual({ released: [proofId] });
      expect(emails).toMatchObject([{ subject: "Now public: The Future of Independent Software" }]);
      expect((await (await get(proofId)).json()).access).toBe("full");
      expect(await (await cron("Bearer cron-secret-for-tests")).json()).toEqual({ released: [] });
    });

    it("doesn't name a newer version visitors can't see", async () => {
      const { author, proofId } = await registerWith(PUBLIC);
      await d.insert(recordEvents).values({
        proofRecordId: (await d.select().from(proofRecords).where(eq(proofRecords.publicId, proofId)))[0]!.id,
        eventType: "newer-version-registered",
        actorUserId: author.userId,
        data: { proofId: "AU-PR1VAT", versionNumber: 2 },
      });
      const body = await (await get(proofId)).json();
      expect(body.events.at(-1)).toEqual({
        type: "newer-version-registered",
        at: expect.any(String),
        proofId: null,
        version: 2,
      });
    });
  });

  describe("POST /api/v1/verify", () => {
    const post = (body: unknown) =>
      verify(
        request("/api/v1/verify", {
          method: "POST",
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );

    it("checks hashes against a specific record", async () => {
      const proofId = await registerWork(d, await createAuthor(d), TEXT);
      const pasted = await fingerprintPastedText(`  ${TEXT}\n`);
      const match = await (await post({ proofId, textHash: pasted.textHash })).json();
      expect(match).toMatchObject({
        proof: { id: proofId, status: "registered" },
        valid: true,
        match: { matched: true, method: "canonical-text", sameVersion: true, version: 1 },
      });
      const miss = await (
        await post({ proofId, textHash: (await fingerprintPastedText("Other.")).textHash })
      ).json();
      expect(miss.match).toEqual({ matched: false });
      expect(await (await post({ proofId })).json()).toMatchObject({ valid: true, match: null });
      expect(await (await post({ proofId: "AU-ZZZZZZ" })).json()).toEqual({
        proof: null,
        valid: false,
        match: null,
      });
    });

    it("looks up records by fingerprint alone", async () => {
      const proofId = await registerWork(d, await createAuthor(d), TEXT);
      const { contentHash } = (await sampleInput(TEXT)).document;
      const body = await (await post({ contentHash })).json();
      expect(body.matches).toMatchObject([{ proofId, method: "exact-bytes", author: "Jane Smith" }]);
    });

    it("rejects malformed requests", async () => {
      expect((await post("{nope")).status).toBe(400);
      const empty = await (await post({})).json();
      expect(empty.error).toMatchObject({ code: "invalid_request" });
      expect((await post({ contentHash: "md5:abc" })).status).toBe(400);
    });
  });

  describe("/api/v1/works", () => {
    async function keyFor(userId: string) {
      return (await createApiKey(d, userId, "Test")).key;
    }
    const post = (key: string | null, body: unknown) =>
      createWork(
        request("/api/v1/works", {
          method: "POST",
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          body: JSON.stringify(body),
        }),
      );

    it("requires an API key", async () => {
      const response = await post(null, {});
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      expect((await post("au_WRONGWRONGWRONGWRONGWRONGWRONG12", {})).status).toBe(401);
    });

    it("prepares a pending registration that only the author can attest", async () => {
      const author = await createAuthor(d);
      const key = await keyFor(author.userId);
      const input = await sampleInput(TEXT);
      const envelope = {
        schema: "authoro-proof/1.0",
        issuer: { id: "issuer:writermark", name: "Writermark" },
        work: { hash: input.document.contentHash },
        evidence: { method: "continuous-composition", sessions: 3 },
      };
      const response = await post(key, { ...input, envelope });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({ object: "registration", version: 1, status: "pending_attestation" });
      expect(body.attestUrl).toBe(`${BASE}/attest/${body.proofId}`);
      // Not public until the author attests.
      expect(
        (await getProof(request(`/api/v1/proofs/${body.proofId}`), proofParams(body.proofId))).status,
      ).toBe(404);

      const list = await listWorks(request("/api/v1/works", { headers: { Authorization: `Bearer ${key}` } }));
      expect((await list.json()).data).toMatchObject([
        { proofId: body.proofId, status: "pending_attestation" },
      ]);
    });

    it("takes several envelopes and links to documentation", async () => {
      const author = await createAuthor(d);
      const key = await keyFor(author.userId);
      const input = await sampleInput(TEXT);
      const envelope = (name: string) => ({
        schema: "authoro-proof/1.1",
        issuer: { id: `issuer:${name.toLowerCase()}`, name },
        work: { hash: input.document.contentHash },
        evidence: { class: "platform-history", method: "revision-history" },
        links: [
          {
            url: `https://${name.toLowerCase()}.example/audit/1`,
            label: "Audit trail",
            reportHash: `sha256:${"c".repeat(64)}`,
          },
        ],
      });
      const body = {
        ...input,
        disclosure: { ...input.disclosure, links: [{ url: "https://www.jane.example/process" }] },
        envelopes: [envelope("Writermark"), JSON.stringify(envelope("Classroom"))],
      };
      expect((await post(key, { ...body, envelope: envelope("Writermark") })).status).toBe(400);
      const created = await post(key, body);
      expect(created.status).toBe(201);
      const { proofId } = await created.json();
      await finalizeRegistration(d, { proofId, userId: author.userId, typedName: "Jane Smith" });

      const proof = await (await getProof(request(`/api/v1/proofs/${proofId}`), proofParams(proofId))).json();
      expect(proof.evidence.map((e: { claimType: string }) => e.claimType)).toEqual([
        "creation-disclosure",
        "proof-envelope",
        "proof-envelope",
      ]);
      expect(proof.evidence[0].payload).toMatchObject({
        schema: "authoro-creation-disclosure/1.1",
        links: [{ url: "https://www.jane.example/process" }],
      });
      expect(proof.versions[0].sources).toMatchObject([
        {
          attribution: "Author supplied",
          supplier: { type: "author", name: "Jane Smith" },
          addedVia: "registration",
          links: [{ url: "https://www.jane.example/process", host: "jane.example", label: null }],
        },
        {
          attribution: "Reported by Writermark",
          supplier: { type: "issuer", name: "Writermark", id: "issuer:writermark" },
          class: "platform-history",
          links: [
            { host: "writermark.example", label: "Audit trail", reportHash: `sha256:${"c".repeat(64)}` },
          ],
        },
        { attribution: "Reported by Classroom" },
      ]);
    });

    it("takes record presets for the author to confirm, and needs Pro for private ones", async () => {
      const author = await createAuthor(d);
      const key = await keyFor(author.userId);
      const input = await sampleInput(TEXT);
      const until = new Date(Date.now() + 24 * 3_600_000).toISOString();
      const record = { visibility: "private", embargoUntil: until, evidenceDisclosure: "minimal" };

      vi.stubEnv("AUTHORO_ALL_PRO", "false");
      const refused = await post(key, { ...input, record });
      expect(refused.status).toBe(403);
      expect((await refused.json()).error.code).toBe("plan_required");
      const invalid = await post(key, { ...input, record: { visibility: "public", embargoUntil: until } });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.details).toEqual([
        "record: Only a private record can have a scheduled release.",
      ]);
      const unknown = await post(key, { ...input, record: { visibility: "public", hidden: true } });
      expect(unknown.status).toBe(400);

      vi.stubEnv("AUTHORO_ALL_PRO", "true");
      const response = await post(key, { ...input, record });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.record).toEqual({
        visibility: "private",
        embargoUntil: until,
        showFingerprint: false,
        evidenceDisclosure: "minimal",
      });
      const [prepared] = await d.select().from(proofRecords).where(eq(proofRecords.publicId, body.proofId));
      expect(prepared).toMatchObject({
        status: "pending_attestation",
        visibility: "private",
        embargoUntil: new Date(until),
        evidenceDisclosure: "minimal",
      });
      // Attesting without changing them keeps them.
      await finalizeRegistration(d, {
        proofId: body.proofId,
        userId: author.userId,
        typedName: "Jane Smith",
      });
      expect((await (await getProof(request(`/x`), proofParams(body.proofId))).json()).access).toBe(
        "embargoed",
      );
    });

    it("refuses an envelopes value that isn't a list", async () => {
      const author = await createAuthor(d);
      const response = await post(await keyFor(author.userId), {
        ...(await sampleInput(TEXT)),
        envelopes: {},
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.details).toEqual([
        "envelopes: Expected an array of Proof Envelopes.",
      ]);
    });

    it("explains validation errors and a missing profile", async () => {
      const author = await createAuthor(d);
      const key = await keyFor(author.userId);
      const invalid = await post(key, { work: { title: "" } });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.details.length).toBeGreaterThan(0);

      const userId = `user_${crypto.randomUUID()}`;
      await d.insert(user).values({ id: userId, name: "No Profile", email: `${userId}@example.com` });
      const response = await post(await keyFor(userId), await sampleInput(TEXT));
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("profile_required");
    });
  });

  describe("POST /api/v1/works/{id}/versions", () => {
    const post = (key: string | null, workId: string, body: unknown) =>
      createVersion(
        request(`/api/v1/works/${workId}/versions`, {
          method: "POST",
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          body: JSON.stringify(body),
        }),
        workParams(workId),
      );

    /** A registered version 1 and an API key for its author. */
    async function registeredWork(author?: Awaited<ReturnType<typeof createAuthor>>) {
      const owner = author ?? (await createAuthor(d));
      const proofId = await registerWork(d, owner, TEXT);
      const proof = await (await getProof(request(`/api/v1/proofs/${proofId}`), proofParams(proofId))).json();
      const { key } = await createApiKey(d, owner.userId, "Test");
      return { owner, key, proofId, workId: proof.work.id as string };
    }

    it("requires an API key and a well-formed work ID", async () => {
      const { key, workId } = await registeredWork();
      expect((await post(null, workId, {})).status).toBe(401);
      const bad = await post(key, "hello", {});
      expect(bad.status).toBe(400);
      expect((await bad.json()).error.code).toBe("invalid_id");
    });

    it("prepares the next version, carrying over details the body leaves out", async () => {
      const { owner, key, proofId: v1, workId } = await registeredWork();
      const { document, disclosure } = await sampleInput("The future of independent software is smaller.");
      const response = await post(key, workId.toLowerCase(), {
        work: { description: "Revised for the print edition." },
        document,
        disclosure,
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({
        object: "registration",
        workId,
        version: 2,
        status: "pending_attestation",
        attestUrl: `${BASE}/attest/${body.proofId}`,
      });
      expect(response.headers.get("location")).toBe(body.attestUrl);

      // Pending until the author attests; then version 1's history points at it.
      expect(
        (await getProof(request(`/api/v1/proofs/${body.proofId}`), proofParams(body.proofId))).status,
      ).toBe(404);
      await finalizeRegistration(d, { proofId: body.proofId, userId: owner.userId, typedName: "Jane Smith" });
      const v2 = await (
        await getProof(request(`/api/v1/proofs/${body.proofId}`), proofParams(body.proofId))
      ).json();
      expect(v2).toMatchObject({
        version: { number: 2 },
        work: {
          id: workId,
          title: "The Future of Independent Software",
          type: "essay",
          description: "Revised for the print edition.",
        },
      });
      const first = await (await getProof(request(`/api/v1/proofs/${v1}`), proofParams(v1))).json();
      expect(first.events).toMatchObject([
        { type: "registered" },
        { type: "newer-version-registered", proofId: body.proofId, version: 2 },
      ]);
    });

    it("409s while a draft is pending and for unchanged content", async () => {
      const { key, proofId: v1, workId } = await registeredWork();
      const unchanged = await post(key, workId, await sampleInput(TEXT));
      expect(unchanged.status).toBe(409);
      expect((await unchanged.json()).error).toMatchObject({ code: "unchanged", proofId: v1 });

      const draft = await (await post(key, workId, await sampleInput("Revised."))).json();
      const blocked = await post(key, workId, await sampleInput("Revised again."));
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error).toMatchObject({ code: "draft_exists", proofId: draft.proofId });
    });

    it("keeps the work type and validates the rest", async () => {
      const { key, workId } = await registeredWork();
      const input = await sampleInput("A new edition.");
      const retyped = await post(key, workId, { ...input, work: { ...input.work, workType: "poem" } });
      expect(retyped.status).toBe(400);
      expect((await retyped.json()).error.details[0]).toMatch(/^work\.workType: /);
      const invalid = await post(key, workId, { document: { contentHash: "md5:abc" } });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.code).toBe("invalid_request");
    });

    it("404s works that don't exist or belong to someone else", async () => {
      const { workId } = await registeredWork();
      const { key: otherKey } = await registeredWork(await createAuthor(d, "other"));
      const input = await sampleInput("Not mine.");
      for (const id of [workId, "AUW-ZZZZZZZZ"]) {
        const response = await post(otherKey, id, input);
        expect(response.status).toBe(404);
        expect((await response.json()).error.code).toBe("not_found");
      }
    });
  });

  describe("POST /api/v1/proofs/{id}/evidence", () => {
    const post = (key: string | null, proofId: string, body: unknown) =>
      addEvidenceRoute(
        request(`/api/v1/proofs/${proofId}/evidence`, {
          method: "POST",
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          body: JSON.stringify(body),
        }),
        proofParams(proofId),
      );
    const fetchProof = async (proofId: string) =>
      (await getProof(request(`/api/v1/proofs/${proofId}`), proofParams(proofId))).json();

    async function registered() {
      const author = await createAuthor(d);
      const proofId = await registerWork(d, author, TEXT);
      const { key } = await createApiKey(d, author.userId, "Writermark sync");
      return { author, proofId, key };
    }

    async function envelope(text = TEXT) {
      return {
        schema: "authoro-proof/1.1",
        issuer: { id: "issuer:writermark", name: "Writermark" },
        work: { hash: (await sampleInput(text)).document.contentHash },
        evidence: { class: "continuous-observed", method: "continuous-composition", sessions: 4 },
        links: [{ url: "https://writermark.example/sessions/42", label: "Session report" }],
      };
    }

    it("requires a key and a record in the key's account", async () => {
      const { proofId } = await registered();
      expect((await post(null, proofId, {})).status).toBe(401);
      const { key: otherKey } = await createApiKey(d, (await createAuthor(d, "other")).userId, "Other");
      const notMine = await post(otherKey, proofId, { envelope: await envelope() });
      expect(notMine.status).toBe(404);
      expect((await notMine.json()).error.code).toBe("not_found");
      const bad = await post(otherKey, "hello", {});
      expect((await bad.json()).error.code).toBe("invalid_id");
    });

    it("holds a submission for the author's approval and emails them", async () => {
      const { author, proofId, key } = await registered();
      const response = await post(key, proofId.toLowerCase(), { envelope: await envelope() });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({
        object: "evidence",
        proofId,
        status: "pending_approval",
        reviewUrl: `${BASE}/p/${proofId}#review`,
      });

      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({
        subject: "Evidence waiting for your approval: The Future of Independent Software",
      });
      expect(emails[0]!.text).toContain("A Proof Envelope from Writermark arrived for version 1");
      expect(emails[0]!.text).toContain("“Writermark sync”");
      expect(emails[0]!.text).toContain(`${BASE}/p/${proofId}#review`);

      // Nothing public until the author approves.
      const before = await fetchProof(proofId);
      expect(before.evidence).toHaveLength(1);
      expect(before.versions[0].sources).toHaveLength(1);

      const duplicate = await post(key, proofId, { envelope: await envelope() });
      expect(duplicate.status).toBe(409);
      expect((await duplicate.json()).error).toMatchObject({
        code: "duplicate_evidence",
        evidenceId: body.id,
      });

      await reviewEvidence(d, { proofId, evidenceId: body.id, userId: author.userId, decision: "approve" });
      const after = await fetchProof(proofId);
      expect(after.evidence[1]).toMatchObject({
        id: body.id,
        claimType: "proof-envelope",
        addedVia: "api",
        status: "active",
        intact: true,
      });
      expect(after.evidence[1].approvedAt).not.toBeNull();
      expect(after.versions[0].sources[1]).toMatchObject({
        attribution: "Reported by Writermark",
        addedVia: "api",
        links: [{ host: "writermark.example", label: "Session report" }],
      });
      expect(after.events.at(-1)).toMatchObject({
        type: "evidence-added",
        evidenceId: body.id,
        claimType: "proof-envelope",
        via: "api",
      });
    });

    it("validates submissions against the version", async () => {
      const { proofId, key } = await registered();
      const details = async (body: unknown) => {
        const response = await post(key, proofId, body);
        expect(response.status).toBe(400);
        return (await response.json()).error.details as string[];
      };
      expect(await details({})).toEqual([
        "Send links to your documentation, or an envelope (a Proof Envelope).",
      ]);
      expect((await details({ envelope: await envelope("Another essay.") }))[0]).toContain(
        "different document",
      );
      expect((await details({ links: [{ url: "http://jane.example/notes" }] }))[0]).toMatch(
        /^links\.0\.url: /,
      );

      const links = await post(key, proofId, { links: [{ url: "https://jane.example/notes" }] });
      expect(links.status).toBe(201);
      expect(emails.at(-1)!.text).toContain("Links to documentation arrived");
    });

    it("409s for drafts and withdrawn records", async () => {
      const { author, proofId, key } = await registered();
      const { proofId: draftId } = await prepareRegistration(d, {
        userId: author.userId,
        profile: author.profile,
        registration: valid(await sampleInput("A draft.")),
      });
      const draft = await post(key, draftId, { links: [{ url: "https://jane.example/notes" }] });
      expect(draft.status).toBe(409);
      expect((await draft.json()).error.code).toBe("not_registered");

      await withdrawRecord(d, { proofId, userId: author.userId, reason: "author-request" });
      const withdrawn = await post(key, proofId, { links: [{ url: "https://jane.example/notes" }] });
      expect(withdrawn.status).toBe(409);
      expect((await withdrawn.json()).error.code).toBe("not_registered");
      expect(emails).toHaveLength(0);
    });
  });
});
