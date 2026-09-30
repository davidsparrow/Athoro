import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Validated server environment. Throws on first use if configuration is missing. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server environment:\n${problems.join("\n")}\nSee apps/web/.env.example.`);
  }
  cached = result.data;
  return cached;
}
