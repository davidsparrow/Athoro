import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Integration tests share one database.
    fileParallelism: false,
    // App modules that use the shared `db` client (e.g. route handlers) talk to the test database.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://unset.invalid/authoro",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "test-secret-test-secret-test-secret-000",
      NEXT_PUBLIC_APP_URL: "https://authoro.test",
    },
  },
});
