import { fingerprintPastedText } from "@authoro/core";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getProof, OPTIONS as proofOptions } from "@/app/api/v1/proofs/[proofId]/route";
import { POST as verify } from "@/app/api/v1/verify/route";
import { GET as listWorks, POST as createWork } from "@/app/api/v1/works/route";
import { apiRateLimits, user } from "@/db/schema";
import { createApiKey } from "@/lib/api/keys";
import { PUBLIC_RATE_LIMIT } from "@/lib/api/http";
import { hashIp } from "@/lib/request-ip";
import { createAuthor, registerWork, sampleInput, testDatabase } from "./helpers";

const db = testDatabase();
const BASE = "https://authoro.test";
const TEXT = "The future of independent software is small.";

function request(path: string, init: RequestInit & { ip?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.ip ?? "198.51.100.7");
  return new Request(`${BASE}${path}`, { ...init, headers });
}

const proofParams = (proofId: string) => ({ params: Promise.resolve({ proofId }) });

describe.skipIf(!db)("API v1", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user", api_rate_limits CASCADE`);
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
      expect(body).toMatchObject({ object: "registration", status: "pending_attestation" });
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
});
