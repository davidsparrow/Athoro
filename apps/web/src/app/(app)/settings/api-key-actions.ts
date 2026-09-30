"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { ApiKeyError, createApiKey, revokeApiKey } from "@/lib/api/keys";
import { recordAudit } from "@/lib/audit";
import { requireAuthor } from "@/lib/session";

export type CreateKeyResult = { key: string; prefix: string } | { error: string };

export async function createApiKeyAction(name: string): Promise<CreateKeyResult> {
  const { session } = await requireAuthor("/settings");
  try {
    const { key, record } = await createApiKey(db, session.user.id, name);
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "api_key.created",
      targetType: "api_key",
      targetId: record.id,
      metadata: { name: record.name, prefix: record.prefix },
      headers: await headers(),
    });
    revalidatePath("/settings");
    return { key, prefix: record.prefix };
  } catch (error) {
    if (error instanceof ApiKeyError) return { error: error.message };
    throw error;
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<void> {
  const { session } = await requireAuthor("/settings");
  if (await revokeApiKey(db, session.user.id, keyId)) {
    await recordAudit({
      actorType: "user",
      actorId: session.user.id,
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: keyId,
      headers: await headers(),
    });
  }
  revalidatePath("/settings");
}
