// =============================================================================
// Cron endpoint: POST /api/cron/snapshot-locked-rounds
//
// Called by GitHub Actions every 30 min. Bearer-token guarded against the
// CRON_SECRET env var. Respects the app_settings.digest_mode toggle — if
// admin has set it to 'manual', this endpoint returns { skipped } without
// sending anything.
//
// This route intentionally ignores any session; only the bearer token grants
// access. Cannot be invoked by a logged-in user.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { processLockedRoundsAsCron } from "@/lib/actions/digest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on the server" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await processLockedRoundsAsCron();
  return NextResponse.json(result);
}
