import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents, session, user } from "@/db/schema";
import type { EmailMessage } from "@/lib/email/send";
import { testDatabase } from "./helpers";

const { emails } = vi.hoisted(() => ({ emails: [] as EmailMessage[] }));

// Outside a Next request there is no `after()`; run deferred work immediately and capture email.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async (message: EmailMessage) => void emails.push(message)),
}));

const { auth } = await import("@/lib/auth");

const db = testDatabase();
const BASE = "https://authoro.test";
const PASSWORD = "correct horse battery";

/** A minimal browser cookie jar for the auth handler's Set-Cookie headers. */
class Jar {
  private cookies = new Map<string, string>();

  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      const expired = !value || attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  has(fragment: string) {
    return [...this.cookies.keys()].some((name) => name.includes(fragment));
  }

  toString() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function call(jar: Jar, path: string, body?: unknown) {
  const headers = new Headers({ origin: BASE, "x-forwarded-for": "198.51.100.7" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (jar.toString()) headers.set("cookie", jar.toString());
  const response = await auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );
  jar.store(response);
  return response;
}

async function signedInUser(jar: Jar) {
  const response = await call(jar, "/get-session");
  return ((await response.json()) as { user?: { id: string } } | null)?.user ?? null;
}

/** RFC 6238 TOTP, as an authenticator app computes it from the otpauth secret. */
async function totp(base32Secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const key: number[] = [];
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(Math.floor(now / 30_000)));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, counter));
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    (((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!) %
    1_000_000;
  return String(code).padStart(6, "0");
}

describe.skipIf(!db)("sign-in security", () => {
  const d = db!;

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user", verification, audit_events CASCADE`);
    emails.length = 0;
  });

  afterAll(async () => {
    await d.$client.end();
  });

  async function signUp(email = `jane-${crypto.randomUUID()}@example.com`) {
    const jar = new Jar();
    await call(jar, "/sign-up/email", { name: "Jane", email, password: PASSWORD });
    await d.update(user).set({ emailVerified: true }).where(eq(user.email, email));
    expect((await call(jar, "/sign-in/email", { email, password: PASSWORD })).status).toBe(200);
    const signedIn = await signedInUser(jar);
    return { jar, email, userId: signedIn!.id };
  }

  async function enableTotp(jar: Jar) {
    const enabled = await (await call(jar, "/two-factor/enable", { password: PASSWORD })).json();
    const secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    expect((await call(jar, "/two-factor/verify-totp", { code: await totp(secret) })).status).toBe(200);
    return { secret, backupCodes: enabled.backupCodes as string[] };
  }

  async function magicLink(email: string, next = "/dashboard") {
    await call(new Jar(), "/sign-in/magic-link", { email, callbackURL: next });
    const link = emails.findLast((message) => message.to === email && message.text.includes("magic-link"));
    const url = new URL(link!.text.match(/https:\/\/\S+magic-link\/verify\S+/)![0]);
    return `${url.pathname.replace("/api/auth", "")}${url.search}`;
  }

  async function actions(userId: string) {
    const rows = await d
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.actorId, userId));
    return rows.map((row) => row.action);
  }

  it("asks for the code after a password once two-step verification is on", async () => {
    const { email, jar: owner, userId } = await signUp();
    const { secret } = await enableTotp(owner);

    const jar = new Jar();
    const response = await call(jar, "/sign-in/email", { email, password: PASSWORD });
    expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await signedInUser(jar)).toBeNull();
    expect((await call(jar, "/two-factor/verify-totp", { code: await totp(secret) })).status).toBe(200);
    expect((await signedInUser(jar))?.id).toBe(userId);
  });

  it("asks for the code after a magic link once two-step verification is on", async () => {
    const { email, jar: owner, userId } = await signUp();
    const { secret } = await enableTotp(owner);
    const sessionsBefore = await d.$count(session, eq(session.userId, userId));

    const jar = new Jar();
    const response = await call(jar, await magicLink(email, "/register?work=AUW-4F8Q2M9C"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/sign-in/two-factor?next=${encodeURIComponent("/register?work=AUW-4F8Q2M9C")}`,
    );
    // The link alone doesn't sign in, and the session it made is gone.
    expect(await signedInUser(jar)).toBeNull();
    expect(jar.has("two_factor")).toBe(true);
    expect(await d.$count(session, eq(session.userId, userId))).toBe(sessionsBefore);

    expect((await call(jar, "/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
    expect((await call(jar, "/two-factor/verify-totp", { code: await totp(secret) })).status).toBe(200);
    expect((await signedInUser(jar))?.id).toBe(userId);
  });

  it("signs straight in from a magic link without two-step verification", async () => {
    const { email, userId } = await signUp();
    const jar = new Jar();
    const response = await call(jar, await magicLink(email));
    expect(response.headers.get("location")).toBe(`${BASE}/dashboard`);
    expect((await signedInUser(jar))?.id).toBe(userId);
  });

  it("keeps the code page's onward link on this site", async () => {
    const { email, jar: owner } = await signUp();
    await enableTotp(owner);
    // Better Auth rejects off-site callbacks when sending the link, except under NODE_ENV=test,
    // so this reaches the hook, which must still never send the author off-site.
    const response = await call(new Jar(), await magicLink(email, "https://evil.example/steal"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/sign-in/two-factor?next=${encodeURIComponent("/dashboard")}`,
    );
  });

  it("signs in once with a backup code and reports it", async () => {
    const { email, jar: owner, userId } = await signUp();
    const { backupCodes } = await enableTotp(owner);
    expect(backupCodes).toHaveLength(10);
    expect(backupCodes[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);

    const jar = new Jar();
    await call(jar, "/sign-in/email", { email, password: PASSWORD });
    expect((await call(jar, "/two-factor/verify-backup-code", { code: backupCodes[0] })).status).toBe(200);
    expect((await signedInUser(jar))?.id).toBe(userId);
    expect(await actions(userId)).toContain("auth.backup_code_used");
    expect(emails.map((message) => message.subject)).toContain(
      "A backup code was used to sign in to Authoro",
    );

    const again = new Jar();
    await call(again, "/sign-in/email", { email, password: PASSWORD });
    expect((await call(again, "/two-factor/verify-backup-code", { code: backupCodes[0] })).status).toBe(401);
  });

  it("needs a recent sign-in to change two-step verification, and reports changes", async () => {
    const { email, jar, userId } = await signUp();
    const { secret } = await enableTotp(jar);
    expect(await actions(userId)).toContain("auth.two_factor_enabled");
    expect(emails.some((message) => message.subject.includes("Two-step verification is on"))).toBe(true);

    await d
      .update(session)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(session.userId, userId));
    const stale = await call(jar, "/two-factor/disable", { password: PASSWORD });
    expect(stale.status).toBe(403);
    expect((await stale.json()).code).toBe("SESSION_NOT_FRESH");
    const staleCodes = await call(jar, "/two-factor/generate-backup-codes", { password: PASSWORD });
    expect(staleCodes.status).toBe(403);

    const fresh = new Jar();
    await call(fresh, "/sign-in/email", { email, password: PASSWORD });
    await call(fresh, "/two-factor/verify-totp", { code: await totp(secret) });
    expect((await call(fresh, "/two-factor/disable", { password: PASSWORD })).status).toBe(200);
    expect(await actions(userId)).toContain("auth.two_factor_disabled");
    const [row] = await d.select({ enabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
    expect(row?.enabled).toBe(false);
  });

  it("lets magic-link accounts turn on two-step verification without a password", async () => {
    const email = `link-${crypto.randomUUID()}@example.com`;
    const jar = new Jar();
    await call(jar, await magicLink(email, "/onboarding"));
    const signedIn = await signedInUser(jar);
    expect(signedIn).not.toBeNull();

    const enabled = await (await call(jar, "/two-factor/enable", {})).json();
    const secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    expect((await call(jar, "/two-factor/verify-totp", { code: await totp(secret) })).status).toBe(200);
    const [row] = await d
      .select({ enabled: user.twoFactorEnabled })
      .from(user)
      .where(and(eq(user.id, signedIn!.id)));
    expect(row?.enabled).toBe(true);
  });
});
