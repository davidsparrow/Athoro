import { describe, expect, it } from "vitest";
import { deploymentOrigins, resolveAppUrl } from "@/lib/app-url";

describe("resolveAppUrl", () => {
  it("prefers an explicit URL", () => {
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://authoro.net/", VERCEL_URL: "x.vercel.app" })).toBe(
      "https://authoro.net",
    );
  });

  it("uses the production domain on Vercel production", () => {
    expect(
      resolveAppUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "authoro.net",
        VERCEL_URL: "authoro-abc123.vercel.app",
      }),
    ).toBe("https://authoro.net");
  });

  it("uses the branch URL on previews, then the deployment URL", () => {
    expect(
      resolveAppUrl({
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "authoro-git-feature.vercel.app",
        VERCEL_URL: "authoro-abc123.vercel.app",
      }),
    ).toBe("https://authoro-git-feature.vercel.app");
    expect(resolveAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: "authoro-abc123.vercel.app" })).toBe(
      "https://authoro-abc123.vercel.app",
    );
  });

  it("falls back to localhost", () => {
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
  });
});

describe("deploymentOrigins", () => {
  it("lists each distinct origin a deployment answers on", () => {
    expect(
      deploymentOrigins({
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "authoro-git-feature.vercel.app",
        VERCEL_URL: "authoro-abc123.vercel.app",
      }),
    ).toEqual(["https://authoro-git-feature.vercel.app", "https://authoro-abc123.vercel.app"]);
  });
});
