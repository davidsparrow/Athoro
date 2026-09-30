import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { serverEnv } from "@/env";
import { clientIp, hashIp } from "./request-ip";

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
      ipHash: ip ? await hashIp(ip, serverEnv().BETTER_AUTH_SECRET) : null,
      userAgent: event.headers?.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (error) {
    console.error("Failed to record audit event", event.action, error);
  }
}
