import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { serverEnv } from "@/env";
import { toHex } from "@authoro/core";

export type AuditActorType = "user" | "api_key" | "system" | "anonymous";

export interface AuditEvent {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  /** Request headers, used for the hashed client IP and user agent. */
  headers?: Headers | null;
}

let ipKey: Promise<CryptoKey> | undefined;

/** Keyed hash of the client IP: correlates events without storing addresses. */
async function hashIp(ip: string): Promise<string> {
  ipKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`authoro-audit-ip:${serverEnv().BETTER_AUTH_SECRET}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", await ipKey, new TextEncoder().encode(ip));
  return toHex(new Uint8Array(signature));
}

function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

/**
 * Appends to the private security audit log. Failures are reported but never
 * block the action being audited.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const ip = event.headers ? clientIp(event.headers) : null;
    await db.insert(auditEvents).values({
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? {},
      ipHash: ip ? await hashIp(ip) : null,
      userAgent: event.headers?.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (error) {
    console.error("Failed to record audit event", event.action, error);
  }
}
