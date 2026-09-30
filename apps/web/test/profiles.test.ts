import "dotenv/config";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { user } from "@/db/schema";
import { createProfileSchema } from "@/lib/profile-validation";
import {
  createAuthorProfile,
  getProfileByUserId,
  isHandleAvailable,
  ProfileError,
  updateAuthorProfile,
} from "@/lib/profiles";

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDatabase(url, { max: 1 }) : null;

describe.skipIf(!db)("author profiles", () => {
  const d = db!;
  const input = (handle: string) =>
    createProfileSchema.parse({ handle, displayName: "Jane Smith", bio: "", websiteUrl: "", isPublic: true });

  async function createUser() {
    const id = `user_${crypto.randomUUID()}`;
    await d.insert(user).values({ id, name: "Jane", email: `${id}@example.com`, emailVerified: true });
    return id;
  }

  beforeEach(async () => {
    await d.execute(sql`TRUNCATE "user" CASCADE`);
  });

  afterAll(async () => {
    await d.$client.end();
  });

  it("creates one profile per account", async () => {
    const userId = await createUser();
    const profile = await createAuthorProfile(d, userId, input("jane"));
    expect(profile).toMatchObject({ userId, handle: "jane", displayName: "Jane Smith", isPublic: true });
    expect((await getProfileByUserId(d, userId))?.id).toBe(profile.id);
    await expect(createAuthorProfile(d, userId, input("jane-2"))).rejects.toMatchObject({ field: "form" });
  });

  it("reports taken handles", async () => {
    await createAuthorProfile(d, await createUser(), input("jane"));
    expect(await isHandleAvailable(d, "jane")).toBe(false);
    expect(await isHandleAvailable(d, "janet")).toBe(true);
    const error = await createAuthorProfile(d, await createUser(), input("jane")).catch((caught) => caught);
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ field: "handle", message: "That handle is taken." });
  });

  it("updates fields but not the handle", async () => {
    const userId = await createUser();
    await createAuthorProfile(d, userId, input("jane"));
    const updated = await updateAuthorProfile(d, userId, {
      displayName: "J. Smith",
      bio: "Essays.",
      websiteUrl: "https://jane.example",
      isPublic: false,
    });
    expect(updated).toMatchObject({
      handle: "jane",
      displayName: "J. Smith",
      bio: "Essays.",
      isPublic: false,
    });
  });

  it("refuses to update a missing profile", async () => {
    const userId = await createUser();
    await expect(
      updateAuthorProfile(d, userId, { displayName: "X", bio: null, websiteUrl: null, isPublic: true }),
    ).rejects.toBeInstanceOf(ProfileError);
  });
});
