/**
 * Authoro registry schema.
 *
 * Integrity rules enforced in the database (see the `immutability` migration):
 * - A work version is immutable once its proof record leaves `pending_attestation`.
 * - Attestation payloads never change; only their status can, and only forward
 *   (evidence awaiting the author's approval is approved or declined, once).
 * - Author attestations, record events and audit events are append-only.
 * Corrections and revocations are recorded as new events, never as overwrites.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

const HASH_CHECK = "^sha256:[0-9a-f]{64}$";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const proofStatus = pgEnum("proof_status", ["pending_attestation", "registered", "withdrawn"]);
export const proofVisibility = pgEnum("proof_visibility", ["public", "unlisted", "private"]);
/** Privacy presets for how much evidence detail the public proof page shows. */
export const evidenceDisclosure = pgEnum("evidence_disclosure", ["minimal", "standard", "detailed"]);
export const evidenceClass = pgEnum("evidence_class", [
  "continuous-observed",
  "platform-history",
  "publisher",
  "identity",
  "ai",
  "self",
]);
export const signatureStatus = pgEnum("signature_status", ["unsigned", "valid", "invalid", "unverifiable"]);
/**
 * `pending_approval`: submitted by an integration after registration and not
 * public until the author approves it (`active`) or declines it (`declined`,
 * final and never public).
 */
export const attestationStatus = pgEnum("attestation_status", [
  "active",
  "revoked",
  "disputed",
  "pending_approval",
  "declined",
]);
/**
 * How evidence reached a version: with the registration the author attested
 * to, added later by the author, or added later through an API key (which
 * waits for the author's approval).
 */
export const evidenceChannel = pgEnum("evidence_channel", ["registration", "author", "api"]);
export const issuerKind = pgEnum("issuer_kind", [
  "authoro",
  "platform",
  "publisher",
  "ai_provider",
  "institution",
  "identity_provider",
]);
export const issuerVerification = pgEnum("issuer_verification", [
  "unverified",
  "verified",
  "suspended",
  "revoked",
]);

/** Public author identity. A user may later hold several (pen names); V0 creates one. */
export const authorProfiles = pgTable(
  "author_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    handle: text().notNull().unique(),
    displayName: text().notNull(),
    bio: text(),
    websiteUrl: text(),
    isPublic: boolean().default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    check("author_profiles_handle_format", sql`${table.handle} ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'`),
  ],
);

/** A conceptual creative work. Its versions carry the registered fingerprints. */
export const works = pgTable(
  "works",
  {
    id: uuid().primaryKey().defaultRandom(),
    publicId: text().notNull().unique(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    authorProfileId: uuid()
      .notNull()
      .references(() => authorProfiles.id, { onDelete: "restrict" }),
    title: text().notNull(),
    workType: text().notNull(),
    canonicalUrl: text(),
    description: text(),
    ...timestamps,
  },
  (table) => [index().on(table.ownerId), index().on(table.authorProfileId)],
);

/** One specific, immutable state of a work. Metadata is snapshotted at registration. */
export const workVersions = pgTable(
  "work_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    workId: uuid()
      .notNull()
      .references(() => works.id, { onDelete: "restrict" }),
    versionNumber: integer().notNull(),
    title: text().notNull(),
    description: text(),
    canonicalUrl: text(),
    authorDisplayName: text().notNull(),
    contentHash: text().notNull(),
    textHash: text(),
    textCanonicalization: text(),
    mediaType: text().notNull(),
    byteLength: bigint({ mode: "number" }).notNull(),
    wordCount: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.workId, table.versionNumber),
    index().on(table.contentHash),
    index().on(table.textHash),
    check("work_versions_version_positive", sql`${table.versionNumber} > 0`),
    check("work_versions_content_hash_format", sql`${table.contentHash} ~ ${sql.raw(`'${HASH_CHECK}'`)}`),
    check(
      "work_versions_text_hash_format",
      sql`${table.textHash} IS NULL OR ${table.textHash} ~ ${sql.raw(`'${HASH_CHECK}'`)}`,
    ),
    check(
      "work_versions_text_canonicalization_present",
      sql`(${table.textHash} IS NULL) = (${table.textCanonicalization} IS NULL)`,
    ),
  ],
);

/** The public record for one work version, resolved at /p/<publicId>. */
export const proofRecords = pgTable(
  "proof_records",
  {
    id: uuid().primaryKey().defaultRandom(),
    publicId: text().notNull().unique(),
    workVersionId: uuid()
      .notNull()
      .unique()
      .references(() => workVersions.id, { onDelete: "restrict" }),
    status: proofStatus().default("pending_attestation").notNull(),
    visibility: proofVisibility().default("public").notNull(),
    evidenceDisclosure: evidenceDisclosure().default("standard").notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    registeredAt: timestamp({ withTimezone: true }),
    withdrawnAt: timestamp({ withTimezone: true }),
    withdrawnReason: text(),
  },
  (table) => [
    index().on(table.status),
    check(
      "proof_records_registered_at_present",
      sql`(${table.status} = 'pending_attestation') = (${table.registeredAt} IS NULL)`,
    ),
    check(
      "proof_records_withdrawn_at_present",
      sql`(${table.status} = 'withdrawn') = (${table.withdrawnAt} IS NOT NULL)`,
    ),
  ],
);

/** An organization or system that submits evidence. Keys and verification arrive in V1. */
export const issuers = pgTable("issuers", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  kind: issuerKind().notNull(),
  domain: text(),
  websiteUrl: text(),
  description: text(),
  verificationStatus: issuerVerification().default("unverified").notNull(),
  ...timestamps,
});

/**
 * One evidence claim about a work version. `issuerId` is null for claims the
 * author supplied themselves; those are always displayed as "Author supplied".
 */
export const attestations = pgTable(
  "attestations",
  {
    id: uuid().primaryKey().defaultRandom(),
    workVersionId: uuid()
      .notNull()
      .references(() => workVersions.id, { onDelete: "restrict" }),
    evidenceClass: evidenceClass().notNull(),
    claimType: text().notNull(),
    issuerId: uuid().references(() => issuers.id, { onDelete: "restrict" }),
    submittedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    payload: jsonb().notNull(),
    payloadHash: text().notNull(),
    signature: text(),
    signatureStatus: signatureStatus().default("unsigned").notNull(),
    status: attestationStatus().default("active").notNull(),
    addedVia: evidenceChannel().default("registration").notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    /** When the author approved or declined evidence that waited for approval. */
    reviewedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    revocationReason: text(),
  },
  (table) => [
    index().on(table.workVersionId),
    index().on(table.issuerId),
    check("attestations_payload_hash_format", sql`${table.payloadHash} ~ ${sql.raw(`'${HASH_CHECK}'`)}`),
    check(
      "attestations_self_has_no_issuer",
      sql`${table.evidenceClass} <> 'self' OR ${table.issuerId} IS NULL`,
    ),
  ],
);

/** The creator's final human attestation. Append-only. */
export const authorAttestations = pgTable(
  "author_attestations",
  {
    id: uuid().primaryKey().defaultRandom(),
    workVersionId: uuid()
      .notNull()
      .references(() => workVersions.id, { onDelete: "restrict" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    statementVersion: text().notNull(),
    legalNameHash: text().notNull(),
    /** Private. Never exposed publicly; lets Authoro confirm a typed name later. */
    legalNameSalt: text().notNull(),
    payload: jsonb().notNull(),
    attestationHash: text().notNull(),
    signedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.workVersionId, table.userId),
    check("author_attestations_hash_format", sql`${table.attestationHash} ~ ${sql.raw(`'${HASH_CHECK}'`)}`),
  ],
);

/** Public, append-only history of a proof record: registration, corrections, revocations. */
export const recordEvents = pgTable(
  "record_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    proofRecordId: uuid()
      .notNull()
      .references(() => proofRecords.id, { onDelete: "restrict" }),
    eventType: text().notNull(),
    // No foreign key: the history must outlive the rows it mentions.
    actorUserId: text(),
    data: jsonb().default({}).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.proofRecordId, table.createdAt)],
);

/**
 * Private security audit log. Append-only. Holds no foreign keys so entries
 * outlive the rows they describe; IPs are stored only as keyed hashes.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorType: text().notNull(),
    actorId: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    ipHash: text(),
    userAgent: text(),
    metadata: jsonb().default({}).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.actorId, table.createdAt), index().on(table.action, table.createdAt)],
);

/**
 * Daily aggregate counters per record, for the V0 north-star metric (mark
 * click-through). Counts only: no visitor identifiers, IPs or cookies.
 */
export const proofMetricsDaily = pgTable(
  "proof_metrics_daily",
  {
    proofRecordId: uuid()
      .notNull()
      .references(() => proofRecords.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    markImpressions: integer().default(0).notNull(),
    markClicks: integer().default(0).notNull(),
    pageViews: integer().default(0).notNull(),
    verifications: integer().default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.proofRecordId, table.day] })],
);

/**
 * API keys for the v1 API. Only a SHA-256 hash of each key is stored; keys are
 * high-entropy random strings, so a slow hash adds nothing.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** First characters of the key, shown so owners can tell keys apart. */
    prefix: text().notNull(),
    keyHash: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.userId)],
);

/** Fixed-window request counters for the public API, keyed by API key or hashed IP. */
export const apiRateLimits = pgTable("api_rate_limits", {
  key: text().primaryKey(),
  windowStart: bigint({ mode: "number" }).notNull(),
  count: integer().notNull(),
});

export const authorProfilesRelations = relations(authorProfiles, ({ one, many }) => ({
  user: one(user, { fields: [authorProfiles.userId], references: [user.id] }),
  works: many(works),
}));

export const worksRelations = relations(works, ({ one, many }) => ({
  owner: one(user, { fields: [works.ownerId], references: [user.id] }),
  authorProfile: one(authorProfiles, { fields: [works.authorProfileId], references: [authorProfiles.id] }),
  versions: many(workVersions),
}));

export const workVersionsRelations = relations(workVersions, ({ one, many }) => ({
  work: one(works, { fields: [workVersions.workId], references: [works.id] }),
  proofRecord: one(proofRecords),
  attestations: many(attestations),
  authorAttestations: many(authorAttestations),
}));

export const proofRecordsRelations = relations(proofRecords, ({ one, many }) => ({
  workVersion: one(workVersions, { fields: [proofRecords.workVersionId], references: [workVersions.id] }),
  events: many(recordEvents),
}));

export const issuersRelations = relations(issuers, ({ many }) => ({
  attestations: many(attestations),
}));

export const attestationsRelations = relations(attestations, ({ one }) => ({
  workVersion: one(workVersions, { fields: [attestations.workVersionId], references: [workVersions.id] }),
  issuer: one(issuers, { fields: [attestations.issuerId], references: [issuers.id] }),
}));

export const authorAttestationsRelations = relations(authorAttestations, ({ one }) => ({
  workVersion: one(workVersions, {
    fields: [authorAttestations.workVersionId],
    references: [workVersions.id],
  }),
  user: one(user, { fields: [authorAttestations.userId], references: [user.id] }),
}));

export const recordEventsRelations = relations(recordEvents, ({ one }) => ({
  proofRecord: one(proofRecords, { fields: [recordEvents.proofRecordId], references: [proofRecords.id] }),
}));
