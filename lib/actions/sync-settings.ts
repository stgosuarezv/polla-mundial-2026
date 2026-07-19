"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncResults } from "@/lib/sync";
import { rescoreAllWithClient } from "@/lib/rescore";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

// ── Read sync mode ────────────────────────────────────────────────────────────

export async function getSyncMode(): Promise<
  ActionResult<{ mode: "manual" | "automated" }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("sync_mode")
    .eq("id", 1)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { mode: data.sync_mode } };
}

// ── Write sync mode ───────────────────────────────────────────────────────────

export async function setSyncMode(
  mode: "manual" | "automated"
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (mode !== "manual" && mode !== "automated") {
    return { ok: false, error: "Invalid mode" };
  }

  const admin = createAdminClient();

  const { data: prev } = await admin
    .from("app_settings")
    .select("sync_mode")
    .eq("id", 1)
    .single();

  const { error: updErr } = await admin
    .from("app_settings")
    .update({
      sync_mode: mode,
      updated_by: guard.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (updErr) return { ok: false, error: updErr.message };

  await admin.from("app_settings_audit").insert({
    changed_by: guard.userId,
    old_value: { sync_mode: prev?.sync_mode ?? null },
    new_value: { sync_mode: mode },
  });

  return { ok: true };
}

// ── Cron entry point (no admin session — bearer-token route calls this) ───────

export async function syncAndRescoreAsCron(): Promise<
  ActionResult<{
    synced?: number;
    teamsAssigned?: number;
    rescored?: number;
    errors?: string[];
    skipped?: string;
  }>
> {
  const admin = createAdminClient();

  // 1. Check mode toggle
  const { data: settings, error: settingsErr } = await admin
    .from("app_settings")
    .select("sync_mode")
    .eq("id", 1)
    .single();

  if (settingsErr) return { ok: false, error: settingsErr.message };
  if (settings?.sync_mode !== "automated") {
    return { ok: true, data: { skipped: "manual mode" } };
  }

  // 2. Smart-skip: only gates the EXTERNAL football-data.org call (step 3),
  //    to avoid unnecessary API traffic. Proceed with a sync when EITHER:
  //    a) A match kicked off ≥ 105 minutes ago and isn't finished yet (live
  //       score polling window — can't end before kickoff + 1h47).
  //    b) Any non-finished match still has a null team slot — football-data.org
  //       publishes bracket assignments gradually and we want to fill them as
  //       soon as the API has the data, regardless of how far away the match is.
  //       No kickoff window: the API call is one request either way.
  //    Rescore (step 4) is NOT gated by this — it always runs every pass,
  //    since it's idempotent and cheap (≤104 matches) and needs to react to
  //    matches that finished without a live-window sync (e.g. a match that
  //    already has a final score on record but whose bonus/points weren't
  //    recalculated yet), not just to matches this pass just synced.
  const [{ count: liveCount }, { count: teamFillCount }] = await Promise.all([
    admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .lt("kickoff_at", new Date(Date.now() - 105 * 60 * 1000).toISOString())
      .neq("status", "finished"),
    admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .neq("status", "finished")
      .or("home_team_id.is.null,away_team_id.is.null"),
  ]);

  const shouldSync = (liveCount ?? 0) > 0 || (teamFillCount ?? 0) > 0;

  // 3. Sync from football-data.org (skipped when there's nothing pending)
  let syncResult: { updated: number; teamsAssigned: number; skipped: number; errors: string[] } | null = null;
  if (shouldSync) {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "FOOTBALL_DATA_API_KEY is not configured" };
    }

    try {
      syncResult = await syncResults(admin, apiKey);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // 4. Rescore — idempotent and cheap (≤104 matches), so run it on every
  //    pass regardless of whether step 3 ran. This also repairs scores after
  //    manual result entry or a previously failed run.
  let rescored: number;
  try {
    const rescoreResult = await rescoreAllWithClient(admin);
    rescored = rescoreResult.updated;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  return {
    ok: true,
    data: {
      synced: syncResult?.updated,
      teamsAssigned: syncResult?.teamsAssigned,
      rescored,
      errors: syncResult?.errors.length ? syncResult.errors : undefined,
      skipped: shouldSync ? undefined : "no pending matches to sync",
    },
  };
}
