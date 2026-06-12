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

  // 2. Smart-skip: are there any matches that kicked off ≥ 105 minutes ago
  //    and aren't finished yet? If not, nothing to poll for. A match can't
  //    end before ~kickoff + 1h47 (90' + 15' halftime + stoppage), so this
  //    opens the polling window just before the earliest possible full time.
  const { count } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .lt("kickoff_at", new Date(Date.now() - 105 * 60 * 1000).toISOString())
    .neq("status", "finished");

  if ((count ?? 0) === 0) {
    return { ok: true, data: { skipped: "no pending matches" } };
  }

  // 3. Sync from football-data.org
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "FOOTBALL_DATA_API_KEY is not configured" };
  }

  let syncResult: { updated: number; skipped: number; errors: string[] };
  try {
    syncResult = await syncResults(admin, apiKey);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // 4. Rescore — idempotent and cheap (≤104 matches), so run it on every
  //    sync pass rather than only when this pass updated a match. This also
  //    repairs scores after manual result entry or a previously failed run.
  const rescoreResult = await rescoreAllWithClient(admin);
  const rescored = rescoreResult.updated;

  return {
    ok: true,
    data: {
      synced: syncResult.updated,
      rescored,
      errors: syncResult.errors.length ? syncResult.errors : undefined,
    },
  };
}
