import "dotenv/config";
import { fingerprintPastedText } from "@authoro/core";
import { createDatabase, type Database } from "@/db/client";
import { user } from "@/db/schema";
import { createProfileSchema } from "@/lib/profile-validation";
import { createAuthorProfile } from "@/lib/profiles";
import { prepareRegistration, finalizeRegistration } from "@/lib/registration";
import { validateRegistration, type RegistrationInput } from "@/lib/registration-validation";

const url = process.env.TEST_DATABASE_URL;

/** A connection to the test database, or null when TEST_DATABASE_URL is unset. */
export function testDatabase(): Database | null {
  return url ? createDatabase(url, { max: 1 }) : null;
}

export async function sampleInput(text = "The future of independent software is small.") {
  const fp = await fingerprintPastedText(text);
  return {
    work: {
      title: "The Future of Independent Software",
      workType: "essay",
      canonicalUrl: "",
      description: "",
    },
    document: {
      source: "text",
      contentHash: fp.contentHash,
      textHash: fp.textHash ?? null,
      mediaType: fp.mediaType,
      byteLength: fp.byteLength,
      wordCount: fp.wordCount ?? null,
    },
    disclosure: {
      methods: ["ai-assisted"],
      aiUses: ["editing"],
      aiTools: ["Claude"],
      note: "Copyediting only.",
    },
  } satisfies RegistrationInput;
}

export function valid(input: unknown) {
  const result = validateRegistration(input);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

export async function createAuthor(db: Database, handle = "jane") {
  const userId = `user_${crypto.randomUUID()}`;
  await db
    .insert(user)
    .values({ id: userId, name: "Jane", email: `${userId}@example.com`, emailVerified: true });
  const profile = await createAuthorProfile(
    db,
    userId,
    createProfileSchema.parse({ handle, displayName: "Jane Smith", bio: "", websiteUrl: "", isPublic: true }),
  );
  return { userId, profile };
}

/** Prepares and attests a registration; returns its proof ID. */
export async function registerWork(
  db: Database,
  author: Awaited<ReturnType<typeof createAuthor>>,
  text?: string,
) {
  const { proofId } = await prepareRegistration(db, {
    userId: author.userId,
    profile: author.profile,
    registration: valid(await sampleInput(text)),
  });
  await finalizeRegistration(db, { proofId, userId: author.userId, typedName: "Jane Smith" });
  return proofId;
}
