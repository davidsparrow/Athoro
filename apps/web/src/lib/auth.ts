import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv } from "@/env";

export const auth = betterAuth({
  appName: "Authoro",
  baseURL: serverEnv().NEXT_PUBLIC_APP_URL,
  secret: serverEnv().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
  // nextCookies must stay last so it can set cookies from server actions.
  plugins: [nextCookies()],
});
