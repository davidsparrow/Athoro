import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
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
import { PUBLIC_EVIDENCE_STATUSES } from "./evidence";
import { buildProvenance } from "./provenance";
import { embargoDue, publicAccess, releaseDueEmbargoes, type ReleasedRecord } from "./visibility";

/** Record events a visitor sees while an embargo holds: when it was registered and its schedule. */
const EMBARGO_EVENTS = new Set(["registered", "embargo-changed"]);

function loadRecordRow(db: Database, proofId: string, now: Date) {
  return db
    .select({
      record: proofRecords,
      version: workVersions,
      work: works,
      profile: authorProfiles,
      // Another version of the work whose embargo has passed, so this page lists it correctly.
      dueSibling: sql<boolean>`exists (
        select 1 from ${proofRecords} as sibling
        join ${workVersions} as sibling_version on sibling_version.id = sibling.work_version_id
        where sibling_version.work_id = ${works.id}
          and sibling.status = 'registered' and sibling.visibility = 'private'
          and sibling.embargo_until <= ${now.toISOString()}::timestamptz
      )`,
    })
    .from(proofRecords)
    .innerJoin(workVersions, eq(workVersions.id, proofRecords.workVersionId))
    .innerJoin(works, eq(works.id, workVersions.workId))
    .innerJoin(authorProfiles, eq(authorProfiles.id, works.authorProfileId))
    .where(eq(proofRecords.publicId, proofId))
    .limit(1);
}

function loadEvents(db: Database, proofRecordId: string) {
  return db
    .select({
      eventType: recordEvents.eventType,
      data: recordEvents.data,
      createdAt: recordEvents.createdAt,
    })
    .from(recordEvents)
    .where(eq(recordEvents.proofRecordId, proofRecordId))
    .orderBy(asc(recordEvents.createdAt), asc(recordEvents.id));
}

/**
 * Everything the public proof page shows for one record. Returns null for
 * unknown IDs and for records that were never attested. A visitor to a
 * private record gets a sealed view instead: an embargo notice, a restricted
 * record's surviving provenance, or only that the record exists. Embargoes on
 * the work's versions whose time has come are released here, and `released`
 * lists them once.
 */
export async function getPublicProof(
  db: Database,
  proofId: string,
  viewerId?: string | null,
  now = new Date(),
) {
  let [row] = await loadRecordRow(db, proofId, now);
  if (!row) return null;
  const isOwner = Boolean(viewerId) && row.work.ownerId === viewerId;
  if (row.record.status === "pending_attestation")
    return isOwner ? { kind: "pending" as const, proofId } : null;

  let released: ReleasedRecord[] = [];
  if (row.dueSibling) {
    released = await releaseDueEmbargoes(db, { now, workId: row.work.id });
    [row] = await loadRecordRow(db, proofId, now);
    if (!row) return null;
  }
  const access = publicAccess(row.record);
  if (access !== "full" && !isOwner) return getSealedProof(db, row, access);

  const [attestation, events, versions, pendingEvidence] = await Promise.all([
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
    loadEvents(db, row.record.id),
    db
      .select({
        workVersionId: workVersions.id,
        proofId: proofRecords.publicId,
        versionNumber: workVersions.versionNumber,
        authorDisplayName: workVersions.authorDisplayName,
        status: proofRecords.status,
        registeredAt: proofRecords.registeredAt,
        contentHash: workVersions.contentHash,
        textHash: workVersions.textHash,
      })
      .from(workVersions)
      .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
      .where(
        and(
          eq(workVersions.workId, row.work.id),
          ne(proofRecords.status, "pending_attestation"),
          // Visitors see public versions and the one they're viewing; private
          // and unlisted versions are listed only for their owner.
          isOwner ? undefined : or(eq(proofRecords.visibility, "public"), eq(proofRecords.id, row.record.id)),
        ),
      )
      .orderBy(asc(workVersions.versionNumber)),
    // Submissions waiting for the author's approval are shown only to the author.
    isOwner
      ? db
          .select()
          .from(attestations)
          .where(
            and(eq(attestations.workVersionId, row.version.id), eq(attestations.status, "pending_approval")),
          )
          .orderBy(asc(attestations.createdAt))
      : Promise.resolve([]),
  ]);

  // Every version's public evidence, for this record's cards and the provenance history.
  const allEvidence = await db
    .select()
    .from(attestations)
    .where(
      and(
        inArray(
          attestations.workVersionId,
          versions.map((version) => version.workVersionId),
        ),
        inArray(attestations.status, [...PUBLIC_EVIDENCE_STATUSES]),
      ),
    )
    .orderBy(asc(attestations.createdAt));

  return {
    kind: "record" as const,
    isOwner,
    /** What visitors see; the owner always sees the full record. */
    access,
    released,
    record: row.record,
    version: row.version,
    work: row.work,
    author: {
      displayName: row.version.authorDisplayName,
      handle: row.profile.handle,
      isPublic: row.profile.isPublic,
    },
    evidence: allEvidence.filter((item) => item.workVersionId === row.version.id),
    pendingEvidence,
    authorAttestation: attestation[0] ?? null,
    events,
    versions,
    provenance: buildProvenance(versions, allEvidence),
  };
}

export type PublicProof = Extract<Awaited<ReturnType<typeof getPublicProof>>, { kind: "record" }>;

type RecordRow = NonNullable<Awaited<ReturnType<typeof loadRecordRow>>[number]>;

/**
 * What a visitor sees of a private record. Visibility can decrease disclosure
 * but never erase provenance: a restricted record keeps its ID, timestamps,
 * fingerprint and history; an embargoed one shows when it was registered,
 * when it will be released, how many issuers reported on it and, if the
 * author allows, its fingerprint; a record private from the start shows only
 * that it exists.
 */
async function getSealedProof(
  db: Database,
  { record, version }: RecordRow,
  access: "embargoed" | "restricted" | "private",
) {
  const base = { kind: "sealed" as const, access, proofId: record.publicId };
  if (access === "private") return { ...base, sealed: null };

  const fingerprint =
    access === "restricted" || record.embargoShowsFingerprint
      ? {
          versionNumber: version.versionNumber,
          contentHash: version.contentHash,
          textHash: version.textHash,
          textCanonicalization: version.textCanonicalization,
        }
      : null;
  const [events, attestation, envelopes] = await Promise.all([
    loadEvents(db, record.id),
    access === "restricted"
      ? db
          .select({ attestationHash: authorAttestations.attestationHash })
          .from(authorAttestations)
          .where(eq(authorAttestations.workVersionId, version.id))
          .limit(1)
      : Promise.resolve([]),
    access === "embargoed"
      ? db
          .select({ payload: attestations.payload })
          .from(attestations)
          .where(
            and(
              eq(attestations.workVersionId, version.id),
              eq(attestations.claimType, "proof-envelope"),
              eq(attestations.status, "active"),
            ),
          )
      : Promise.resolve([]),
  ]);
  const restriction = events.findLast(
    (event) =>
      event.eventType === "visibility-changed" && (event.data as { to?: string } | null)?.to === "private",
  );
  return {
    ...base,
    sealed: {
      status: record.status,
      registeredAt: record.registeredAt!,
      publishedAt: record.publishedAt,
      embargoUntil: record.embargoUntil,
      withdrawnAt: record.withdrawnAt,
      withdrawnReason: record.withdrawnReason,
      restrictedAt: restriction?.createdAt ?? null,
      /** How the record was seen before it was restricted. */
      previousVisibility: ((restriction?.data as { from?: string } | null)?.from ?? null) as
        "public" | "unlisted" | null,
      fingerprint,
      attestationHash: attestation[0]?.attestationHash ?? null,
      issuerCount:
        access === "embargoed"
          ? new Set(envelopes.map(({ payload }) => (payload as { issuer?: { id?: string } }).issuer?.id)).size
          : null,
      events:
        access === "restricted" ? events : events.filter((event) => EMBARGO_EVENTS.has(event.eventType)),
    },
  };
}

export type SealedProof = Extract<Awaited<ReturnType<typeof getPublicProof>>, { kind: "sealed" }>;

/**
 * Minimal lookup for high-traffic routes such as the mark image, with what a
 * visitor can see. Releases a due embargo like the record page does.
 */
export async function getProofStatus(db: Database, proofId: string, now = new Date()) {
  const select = () =>
    db
      .select({
        id: proofRecords.id,
        status: proofRecords.status,
        visibility: proofRecords.visibility,
        publishedAt: proofRecords.publishedAt,
        embargoUntil: proofRecords.embargoUntil,
      })
      .from(proofRecords)
      .where(eq(proofRecords.publicId, proofId))
      .limit(1);
  let [row] = await select();
  if (!row) return null;
  let released: ReleasedRecord[] = [];
  if (embargoDue(row, now)) {
    released = await releaseDueEmbargoes(db, { now, proofRecordId: row.id });
    [row] = await select();
    if (!row) return null;
  }
  return { ...row, access: publicAccess(row), released };
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
