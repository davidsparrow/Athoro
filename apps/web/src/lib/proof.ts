import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  attestations,
  authorAttestations,
  authorProfiles,
  proofMetricsDaily,
  proofRecords,
  recordEvents,
  works,
  workVersions,
} from "@/db/schema";

/**
 * Everything the public proof page shows for one record. Returns null for
 * unknown IDs and for records that were never attested; `private` records
 * are only returned to their owner.
 */
export async function getPublicProof(db: Database, proofId: string, viewerId?: string | null) {
  const [row] = await db
    .select({ record: proofRecords, version: workVersions, work: works, profile: authorProfiles })
    .from(proofRecords)
    .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .innerJoin(authorProfiles, eq(authorProfiles.id, works.authorProfileId))
    .where(eq(proofRecords.publicId, proofId))
    .limit(1);
  if (!row) return null;
  const isOwner = Boolean(viewerId) && row.work.ownerId === viewerId;
  if (row.record.status === "pending_attestation")
    return isOwner ? { kind: "pending" as const, proofId } : null;
  if (row.record.visibility === "private" && !isOwner) return null;

  const [evidence, attestation, events, versions] = await Promise.all([
    db
      .select()
      .from(attestations)
      .where(eq(attestations.workVersionId, row.version.id))
      .orderBy(asc(attestations.createdAt)),
    db
      .select({
        statementVersion: authorAttestations.statementVersion,
        attestationHash: authorAttestations.attestationHash,
        signedAt: authorAttestations.signedAt,
        payload: authorAttestations.payload,
      })
      .from(authorAttestations)
      .where(eq(authorAttestations.workVersionId, row.version.id))
      .limit(1),
    db
      .select({
        eventType: recordEvents.eventType,
        data: recordEvents.data,
        createdAt: recordEvents.createdAt,
      })
      .from(recordEvents)
      .where(eq(recordEvents.proofRecordId, row.record.id))
      .orderBy(asc(recordEvents.createdAt), asc(recordEvents.id)),
    db
      .select({
        proofId: proofRecords.publicId,
        versionNumber: workVersions.versionNumber,
        status: proofRecords.status,
        registeredAt: proofRecords.registeredAt,
        contentHash: workVersions.contentHash,
        textHash: workVersions.textHash,
      })
      .from(workVersions)
      .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
      .where(and(eq(workVersions.workId, row.work.id), ne(proofRecords.status, "pending_attestation")))
      .orderBy(asc(workVersions.versionNumber)),
  ]);

  return {
    kind: "record" as const,
    isOwner,
    record: row.record,
    version: row.version,
    work: row.work,
    author: {
      displayName: row.version.authorDisplayName,
      handle: row.profile.handle,
      isPublic: row.profile.isPublic,
    },
    evidence,
    authorAttestation: attestation[0] ?? null,
    events,
    versions,
  };
}

export type PublicProof = Extract<Awaited<ReturnType<typeof getPublicProof>>, { kind: "record" }>;

/** Minimal lookup for high-traffic routes such as the mark image. */
export async function getProofStatus(db: Database, proofId: string) {
  const [row] = await db
    .select({ id: proofRecords.id, status: proofRecords.status, visibility: proofRecords.visibility })
    .from(proofRecords)
    .where(eq(proofRecords.publicId, proofId))
    .limit(1);
  return row ?? null;
}

export type MetricField = "markImpressions" | "markClicks" | "pageViews" | "verifications";

/** Adds one to today's (UTC) counter. Counts only; no visitor data is stored. */
export async function incrementMetric(
  db: Database,
  proofRecordId: string,
  field: MetricField,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  await db
    .insert(proofMetricsDaily)
    .values({ proofRecordId, day, [field]: 1 })
    .onConflictDoUpdate({
      target: [proofMetricsDaily.proofRecordId, proofMetricsDaily.day],
      set: { [field]: sql`${proofMetricsDaily[field]} + 1` },
    });
}

export interface MetricTotals {
  markImpressions: number;
  markClicks: number;
  pageViews: number;
  verifications: number;
}

/** All-time totals per proof record ID. */
export async function getMetricTotals(
  db: Database,
  proofRecordIds: string[],
): Promise<Map<string, MetricTotals>> {
  if (!proofRecordIds.length) return new Map();
  const rows = await db
    .select({
      proofRecordId: proofMetricsDaily.proofRecordId,
      markImpressions: sql<number>`sum(${proofMetricsDaily.markImpressions})::int`,
      markClicks: sql<number>`sum(${proofMetricsDaily.markClicks})::int`,
      pageViews: sql<number>`sum(${proofMetricsDaily.pageViews})::int`,
      verifications: sql<number>`sum(${proofMetricsDaily.verifications})::int`,
    })
    .from(proofMetricsDaily)
    .where(inArray(proofMetricsDaily.proofRecordId, proofRecordIds))
    .groupBy(proofMetricsDaily.proofRecordId);
  return new Map(rows.map(({ proofRecordId, ...totals }) => [proofRecordId, totals]));
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|pinterest|whatsapp|telegram|discord|slack|skype|headless/i;

/** Crawlers and link unfurlers shouldn't count as readers. */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}
