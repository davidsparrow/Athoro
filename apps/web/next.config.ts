import type { NextConfig } from "next";
import { resolveAppUrl } from "./src/lib/app-url";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Inlined into server and client bundles; see src/lib/app-url.ts.
  env: { NEXT_PUBLIC_APP_URL: resolveAppUrl(process.env) },
  // The open core library ships TypeScript source.
  transpilePackages: ["@authoro/core"],
  typedRoutes: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
