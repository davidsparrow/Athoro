import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { proofRecords, user, works, workVersions } from "@/db/schema";
import { getPlan } from "./entitlements";
import { isVisibility, type EvidencePreset, type Visibility } from "./visibility-labels";

/**
 * Who can see a record and how much evidence detail it shows (decision 026).
 * Visibility can decrease disclosure, but never erase provenance: a record that
 * has been published can be restricted, never unpublished, and every change
 * after registration is a public record event (written by a database trigger).
 */

export {
  EVIDENCE_PRESETS,
  isEvidencePreset,
  isVisibility,
  VISIBILITIES,
  type EvidencePreset,
  type Visibility,
} from "./visibility-labels";

/**
 * What a visitor sees: the full record, an embargo notice, a restricted
 * record's surviving provenance, or only that a private record exists.
 */
export type RecordAccess = "full" | "embargoed" | "restricted" | "private";

type AccessFields = {
  visibility: Visibility;
  publishedAt: Date | null;
  embargoUntil: Date | null;
};

export function publicAccess(record: AccessFields): RecordAccess {
  if (record.visibility !== "private") return "full";
  if (record.publishedAt) return "restricted";
  return record.embargoUntil ? "embargoed" : "private";
}

/** Whether an embargo's release time has passed (it is released on the next read or cron run). */
export function embargoDue(record: AccessFields & { status: string }, now = new Date()): boolean {
  return (
    record.status === "registered" &&
    record.visibility === "private" &&
    record.embargoUntil !== null &&
    record.embargoUntil.getTime() <= now.getTime()
  );
}

/** Names the account behind record changes in this transaction, for the trigger-written events. */
export async function setActor(tx: Transaction, userId: string) {
  await tx.execute(sql`select set_config('authoro.actor', ${userId}, true)`);
}

export interface ReleasedRecord {
  proofId: string;
  title: string;
  versionNumber: number;
  scheduledFor: Date;
  owner: { email: string; name: string | null };
}

/**
 * Releases embargoed records whose time has come: they become public, published
 * as of their scheduled time, and the trigger appends an `embargo-lifted`
 * event. Idempotent, so the lazy release on read and the cron can race safely.
 */
export async function releaseDueEmbargoes(
  db: Database,
  { now = new Date(), proofRecordId }: { now?: Date; proofRecordId?: string } = {},
): Promise<ReleasedRecord[]> {
  const released = await db
    .update(proofRecords)
    .set({ visibility: "public", publishedAt: sql`${proofRecords.embargoUntil}`, embargoUntil: null })
    .where(
      and(
        eq(proofRecords.status, "registered"),
        eq(proofRecords.visibility, "private"),
        lte(proofRecords.embargoUntil, now),
        proofRecordId ? eq(proofRecords.id, proofRecordId) : undefined,
      ),
    )
    .returning({
      proofId: proofRecords.publicId,
      workVersionId: proofRecords.workVersionId,
      publishedAt: proofRecords.publishedAt,
    });
  if (!released.length) return [];
  const details = await db
    .select({
      workVersionId: workVersions.id,
      title: workVersions.title,
      versionNumber: workVersions.versionNumber,
      email: user.email,
      name: user.name,
    })
    .from(workVersions)
    .innerJoin(works, eq(works.id, workVersions.workId))
    .innerJoin(user, eq(user.id, works.ownerId))
    .where(
      inArray(
        workVersions.id,
        released.map((row) => row.workVersionId),
      ),
    );
  return released.flatMap((row) => {
    const detail = details.find((item) => item.workVersionId === row.workVersionId);
    return detail
      ? [
          {
            proofId: row.proofId,
            title: detail.title,
            versionNumber: detail.versionNumber,
            scheduledFor: row.publishedAt!,
            owner: { email: detail.email, name: detail.name },
          },
        ]
      : [];
  });
}

/** The earliest and latest embargo release times accepted, relative to now. */
export const EMBARGO_MIN_LEAD_MS = 5 * 60 * 1000;
export const EMBARGO_MAX_YEARS = 10;

/** Who can see a record, as the author chooses it at attestation or later. */
export interface AccessChoice {
  visibility: Visibility;
  /** A scheduled release; only for a private record that has never been published. */
  embargoUntil: Date | null;
  embargoShowsFingerprint: boolean;
}

export type VisibilityErrorCode = "not-found" | "not-registered" | "invalid" | "plan-required";

export class VisibilityError extends Error {
  constructor(
    readonly code: VisibilityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VisibilityError";
  }
}

/** Checks an access choice against the record's history. Returns an error message, or null. */
export function accessChoiceProblem(
  choice: AccessChoice,
  { published, now = new Date() }: { published: boolean; now?: Date },
): string | null {
  if (!choice.embargoUntil) return null;
  if (choice.visibility !== "private") return "Only a private record can have a scheduled release.";
  if (published) {
    return "This record has already been public, so it can't be embargoed. You can restrict it instead.";
  }
  const lead = choice.embargoUntil.getTime() - now.getTime();
  if (Number.isNaN(lead)) return "Choose a release date and time.";
  if (lead < EMBARGO_MIN_LEAD_MS) return "Choose a release time at least five minutes from now.";
  const latest = new Date(now);
  latest.setUTCFullYear(latest.getUTCFullYear() + EMBARGO_MAX_YEARS);
  if (choice.embargoUntil > latest) return `Choose a release date within ${EMBARGO_MAX_YEARS} years.`;
  return null;
}

/** Whether a choice needs Pro: anything but a public record. Making a record public is always free. */
export function choiceNeedsPro(choice: AccessChoice): boolean {
  return choice.visibility !== "public";
}

/** Reads an access choice from a form: `visibility`, `release` (`now` or `scheduled`), `embargoUntil` (ISO), `showFingerprint`. */
export function parseAccessChoice(formData: FormData): AccessChoice | null {
  const visibility = formData.get("visibility");
  if (!isVisibility(visibility)) return null;
  const scheduled = visibility === "private" && formData.get("release") === "scheduled";
  const raw = String(formData.get("embargoUntil") ?? "");
  return {
    visibility,
    embargoUntil: scheduled ? new Date(raw || Number.NaN) : null,
    embargoShowsFingerprint: scheduled && formData.get("showFingerprint") === "on",
  };
}

async function lockOwnedRecord(tx: Transaction, proofId: string, userId: string, now = new Date()) {
  const [row] = await tx
    .select({ record: proofRecords })
    .from(proofRecords)
    .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .where(and(eq(proofRecords.publicId, proofId), eq(works.ownerId, userId)))
    .for("update", { of: proofRecords })
    .limit(1);
  if (!row) throw new VisibilityError("not-found", "Record not found.");
  if (row.record.status !== "registered") {
    throw new VisibilityError(
      "not-registered",
      row.record.status === "withdrawn"
        ? "This record is withdrawn and final, so who can see it can't change."
        : "Finish the attestation first.",
    );
  }
  if (!embargoDue(row.record, now)) return row.record;
  // A due embargo is released before anything else changes (no actor: it's the schedule's doing).
  const [released] = await tx
    .update(proofRecords)
    .set({ visibility: "public", publishedAt: row.record.embargoUntil, embargoUntil: null })
    .where(eq(proofRecords.id, row.record.id))
    .returning();
  return released!;
}

/**
 * Changes who can see a registered record. A due embargo is released first, so
 * a late change can't hold back a record that is already public. Restricting a
 * published record keeps its ID, timestamps, fingerprint and history public.
 */
export async function changeRecordAccess(
  db: Database,
  {
    proofId,
    userId,
    choice,
    confirmedRestriction = false,
    now = new Date(),
  }: {
    proofId: string;
    userId: string;
    choice: AccessChoice;
    /** The author confirmed that restricting a published record leaves its provenance public. */
    confirmedRestriction?: boolean;
    now?: Date;
  },
): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const record = await lockOwnedRecord(tx, proofId, userId, now);
    const published = record.publishedAt !== null;
    const problem = accessChoiceProblem(choice, { published, now });
    if (problem) throw new VisibilityError("invalid", problem);

    const embargoUntil = choice.embargoUntil;
    const showsFingerprint = embargoUntil ? choice.embargoShowsFingerprint : false;
    const unchanged =
      record.visibility === choice.visibility &&
      (record.embargoUntil?.getTime() ?? null) === (embargoUntil?.getTime() ?? null) &&
      record.embargoShowsFingerprint === showsFingerprint;
    if (unchanged) return { changed: false };
    if (
      published &&
      choice.visibility === "private" &&
      record.visibility !== "private" &&
      !confirmedRestriction
    ) {
      throw new VisibilityError(
        "invalid",
        "Confirm that you understand what visitors will still see of a restricted record.",
      );
    }
    if (choiceNeedsPro(choice) && (await getPlan(db, userId)) !== "pro") {
      throw new VisibilityError(
        "plan-required",
        "Private, unlisted and embargoed records are part of Authoro Pro. Making a record public is always free.",
      );
    }

    await setActor(tx, userId);
    await tx
      .update(proofRecords)
      .set({
        visibility: choice.visibility,
        embargoUntil,
        embargoShowsFingerprint: showsFingerprint,
        ...(choice.visibility !== "private" && !published ? { publishedAt: now } : {}),
      })
      .where(eq(proofRecords.id, record.id));
    return { changed: true };
  });
}

/** Changes how much evidence detail a registered record shows. Free, and recorded in its history. */
export async function changeEvidencePreset(
  db: Database,
  { proofId, userId, preset }: { proofId: string; userId: string; preset: EvidencePreset },
): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const record = await lockOwnedRecord(tx, proofId, userId);
    if (record.evidenceDisclosure === preset) return { changed: false };
    await setActor(tx, userId);
    await tx.update(proofRecords).set({ evidenceDisclosure: preset }).where(eq(proofRecords.id, record.id));
    return { changed: true };
  });
}
