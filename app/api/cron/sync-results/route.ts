// =============================================================================
// Cron endpoint: POST /api/cron/sync-results
//
// Called by Supabase pg_cron every minute (GitHub Actions remains a manual
// workflow_dispatch fallback). Bearer-token guarded against the CRON_SECRET
// env var. Respects the app_settings.sync_mode toggle — if admin has set it
// to 'manual', this endpoint returns { skipped } without hitting
// football-data.org. Also smart-skips when no matches kicked off ≥ 105 min
// ago are still pending (rest days / pre-match periods cost zero API calls).
//
// On 'automated' mode with pending matches:
//   1. Fetches all FINISHED WC matches from football-data.org (one API call).
//   2. Updates our matches rows (syncResults).
//   3. If any rows were updated, rescores all affected predictions.
//
// This route intentionally ignores any session; only the bearer token grants
// access. Cannot be invoked by a logged-in user.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { syncAndRescoreAsCron } from "@/lib/actions/sync-settings";

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

  const result = await syncAndRescoreAsCron();
  return NextResponse.json(result);
}
