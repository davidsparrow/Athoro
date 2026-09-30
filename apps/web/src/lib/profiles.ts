import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import { authorProfiles, proofRecords, works, workVersions } from "@/db/schema";
import type { CreateProfileInput, ProfileFields } from "./profile-validation";

export type AuthorProfile = typeof authorProfiles.$inferSelect;

export class ProfileError extends Error {
  constructor(
    readonly field: "handle" | "form",
    message: string,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code === "23505" || (error as { code?: string })?.code === "23505";
}

export async function getProfileByUserId(db: Database, userId: string): Promise<AuthorProfile | null> {
  const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId)).limit(1);
  return profile ?? null;
}

export async function getProfileByHandle(db: Database, handle: string): Promise<AuthorProfile | null> {
  const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.handle, handle)).limit(1);
  return profile ?? null;
}

export async function isHandleAvailable(db: Database, handle: string): Promise<boolean> {
  return (await getProfileByHandle(db, handle)) === null;
}

/** V0 gives each account one author profile; pen names arrive later. */
export async function createAuthorProfile(
  db: Database,
  userId: string,
  input: CreateProfileInput,
): Promise<AuthorProfile> {
  if (await getProfileByUserId(db, userId)) {
    throw new ProfileError("form", "You already have an author profile.");
  }
  try {
    const [profile] = await db
      .insert(authorProfiles)
      .values({ userId, ...input })
      .returning();
    return profile!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ProfileError("handle", "That handle is taken.");
    throw error;
  }
}

/** Handles are permanent in V0 because proof pages link to them. */
export async function updateAuthorProfile(
  db: Database,
  userId: string,
  input: ProfileFields,
): Promise<AuthorProfile> {
  const [profile] = await db
    .update(authorProfiles)
    .set(input)
    .where(eq(authorProfiles.userId, userId))
    .returning();
  if (!profile) throw new ProfileError("form", "Create your author profile first.");
  return profile;
}

/**
 * A public author page: the profile and the latest public version of each of
 * its works. Returns null when the author has hidden their page.
 */
export async function getAuthorPage(db: Database, handle: string) {
  const profile = await getProfileByHandle(db, handle);
  if (!profile?.isPublic) return null;

  const rows = await db
    .select({
      workId: works.publicId,
      workType: works.workType,
      workCreatedAt: works.createdAt,
      title: workVersions.title,
      versionNumber: workVersions.versionNumber,
      proofId: proofRecords.publicId,
      status: proofRecords.status,
      registeredAt: proofRecords.registeredAt,
    })
    .from(works)
    .innerJoin(workVersions, eq(workVersions.workId, works.id))
    .innerJoin(proofRecords, eq(proofRecords.workVersionId, workVersions.id))
    .where(
      and(
        eq(works.authorProfileId, profile.id),
        ne(proofRecords.status, "pending_attestation"),
        eq(proofRecords.visibility, "public"),
      ),
    )
    .orderBy(desc(works.createdAt), desc(workVersions.versionNumber));

  const latestByWork = new Map<string, (typeof rows)[number] & { versionCount: number }>();
  for (const row of rows) {
    const latest = latestByWork.get(row.workId);
    if (latest) latest.versionCount++;
    else latestByWork.set(row.workId, { ...row, versionCount: 1 });
  }

  return {
    profile: {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      websiteUrl: profile.websiteUrl,
      memberSince: profile.createdAt,
    },
    works: [...latestByWork.values()],
  };
}
