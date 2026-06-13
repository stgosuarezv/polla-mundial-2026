import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    // Bake the Vercel commit SHA into the client bundle so VersionReloadGuard
    // can compare it against the live deployment and auto-reload stale clients
    // (iOS bfcache, tab left open across a deploy). Falls back to "dev" locally.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default withNextIntl(nextConfig);
