"use client";

import { useEffect } from "react";

// BUILD is baked into the bundle at deploy time from VERCEL_GIT_COMMIT_SHA.
// On local dev it is "dev", which disables the guard to avoid reload loops.
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID;

/**
 * Detects client/server build skew and forces a full reload to recover.
 *
 * Two triggers:
 *  - pageshow with e.persisted=true  → iOS back-forward cache restored a stale
 *    client after a new deploy went live.
 *  - visibilitychange to "visible"   → user switched back to a tab that was
 *    open before a deploy.
 *
 * The guard fetches /api/build-id (force-dynamic, no-store) and compares the
 * live SHA against the SHA baked into this bundle. A mismatch means this client
 * is talking to a new deployment — reload into the fresh build so Server Actions
 * and App Router navigation work again.
 *
 * No loop risk: after reload the new bundle's BUILD equals the server id.
 * "dev" guard: skipped locally where VERCEL_GIT_COMMIT_SHA is undefined.
 */
export function VersionReloadGuard() {
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/build-id", { cache: "no-store" });
        const { id } = await r.json();
        if (BUILD && id && id !== "dev" && id !== BUILD) {
          location.reload();
        }
      } catch {
        // Network error — stay silent, don't reload.
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
