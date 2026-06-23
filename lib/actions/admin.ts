"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scorePrediction, scorePodio } from "@/lib/scoring/scoring";
import { syncResults } from "@/lib/sync";
import { rescoreAllWithClient } from "@/lib/rescore";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<null | { ok: false; error: string }> {
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
  return null;
}

// ── Update match result ────────────────────────────────────────────────────────

const UpdateMatchSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).nullable(),
  awayScore: z.number().int().min(0).nullable(),
  status: z.enum(["scheduled", "in_progress", "finished"]),
  penaltyWinnerTeamId: z.string().uuid().nullable(),
  advancingTeamId: z.string().uuid().nullable(),
});

export type UpdateMatchInput = z.infer<typeof UpdateMatchSchema>;

export async function updateMatchResult(
  input: UpdateMatchInput
): Promise<ActionResult<{ matchId: string }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const parsed = UpdateMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const { matchId, homeScore, awayScore, status, penaltyWinnerTeamId, advancingTeamId } =
    parsed.data;

  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Snapshot old value for audit
  const { data: oldMatch } = await admin
    .from("matches")
    .select("home_score, away_score, status, penalty_winner_team_id, advancing_team_id")
    .eq("id", matchId)
    .single();

  const { error } = await admin
    .from("matches")
    .update({ home_score: homeScore, away_score: awayScore, status, penalty_winner_team_id: penaltyWinnerTeamId, advancing_team_id: advancingTeamId })
    .eq("id", matchId);

  if (error) return { ok: false, error: error.message };

  await admin.from("match_audit").insert({
    match_id: matchId,
    changed_by: user!.id,
    old_value: oldMatch,
    new_value: { home_score: homeScore, away_score: awayScore, status, penalty_winner_team_id: penaltyWinnerTeamId, advancing_team_id: advancingTeamId },
  });

  // Score the result immediately — otherwise points only appear whenever the
  // next sync cron pass happens to run a rescore.
  if (status === "finished") {
    await rescoreAllWithClient(admin);
  }

  return { ok: true, data: { matchId } };
}

// ── Rescore all finished matches ───────────────────────────────────────────────

export async function rescoreAll(): Promise<ActionResult<{ updated: number }>> {
  const guard = await requireAdmin();
  if (guard) return guard;
  const admin = createAdminClient();
  const result = await rescoreAllWithClient(admin);
  return { ok: true, data: result };
}

// ── Update user display name ───────────────────────────────────────────────────

const UpdateUserDisplayNameSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(50),
});

export async function updateUserDisplayName(
  input: z.infer<typeof UpdateUserDisplayNameSchema>
): Promise<ActionResult<{ userId: string; displayName: string }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const parsed = UpdateUserDisplayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const { userId, displayName } = parsed.data;

  // Use the session client (not createAdminClient) so auth.uid() is set to
  // the admin's own id. The DB trigger uses auth.uid() to attribute audit rows
  // and to identify admin-path updates (via is_admin()). The "profiles: admins
  // full access" RLS policy allows this session client to update any profile row.
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { userId, displayName } };
}

// ── Update round lock_time ─────────────────────────────────────────────────────

const UpdateRoundLockTimeSchema = z.object({
  roundId: z.string().uuid(),
  lockTime: z.string().datetime(),
});

export async function updateRoundLockTime(
  input: z.infer<typeof UpdateRoundLockTimeSchema>
): Promise<ActionResult<{ roundId: string; lockTime: string }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const parsed = UpdateRoundLockTimeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { roundId, lockTime } = parsed.data;
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRound } = await admin
    .from("rounds")
    .select("stage, lock_time")
    .eq("id", roundId)
    .single();
  if (!oldRound) return { ok: false, error: "notFound" };

  // Ceiling = earliest kickoff in this round; podio falls back to R32
  let ceilingIso: string | null = null;
  const { data: minRow } = await admin
    .from("matches")
    .select("kickoff_at")
    .eq("round_id", roundId)
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (minRow) {
    ceilingIso = minRow.kickoff_at;
  } else if (oldRound.stage === "podio") {
    const { data: r32 } = await admin
      .from("rounds")
      .select("id")
      .eq("name_key", "rounds.knockout_r32")
      .single();
    if (r32) {
      const { data: r32Min } = await admin
        .from("matches")
        .select("kickoff_at")
        .eq("round_id", r32.id)
        .order("kickoff_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      ceilingIso = r32Min?.kickoff_at ?? null;
    }
  }
  if (!ceilingIso) return { ok: false, error: "noCeiling" };

  if (new Date(lockTime).getTime() > new Date(ceilingIso).getTime()) {
    return { ok: false, error: "afterKickoff" };
  }

  const { error } = await admin
    .from("rounds")
    .update({ lock_time: lockTime })
    .eq("id", roundId);
  if (error) return { ok: false, error: error.message };

  await admin.from("round_audit").insert({
    round_id: roundId,
    changed_by: user!.id,
    old_value: { lock_time: oldRound.lock_time },
    new_value: { lock_time: lockTime },
  });

  return { ok: true, data: { roundId, lockTime } };
}

// ── Sync from football-data.org ────────────────────────────────────────────────

export async function syncFromFootballData(): Promise<
  ActionResult<{ updated: number; skipped: number; errors: string[] }>
> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { ok: false, error: "FOOTBALL_DATA_API_KEY is not configured." };

  const admin = createAdminClient();

  try {
    const result = await syncResults(admin, apiKey);
    await rescoreAllWithClient(admin);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Delete a user (admin only) ─────────────────────────────────────────────────

const DeleteUserSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * Removes a player from the pool. Cascades: deletes their profile, predictions,
 * and Podio prediction. Also deletes their invitations row so the email is free
 * to be re-invited later. Writes a row to profile_audit before deleting.
 *
 * Refuses to delete:
 *   - the calling admin themselves
 *   - any other admin (safety: avoid locking the pool out of admin access)
 */
export async function deleteUserByAdmin(
  input: z.infer<typeof DeleteUserSchema>
): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const parsed = DeleteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { userId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!currentUser) return { ok: false, error: "Unauthorized" };
  if (currentUser.id === userId) {
    return { ok: false, error: "selfDelete" };
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("display_name, is_admin")
    .eq("id", userId)
    .single();
  if (targetErr || !target) {
    return { ok: false, error: "User not found" };
  }
  if (target.is_admin) {
    return { ok: false, error: "adminDelete" };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? null;

  // Audit row first so it survives even if anything below fails.
  await admin.from("profile_audit").insert({
    deleted_user_id: userId,
    deleted_email: email,
    deleted_display_name: target.display_name,
    was_admin: target.is_admin,
    changed_by: currentUser.id,
  });

  // Delete the invitations row so the email is available again. Match by email
  // (which is unique on the table).
  if (email) {
    await admin.from("invitations").delete().eq("email", email);
  }

  // Finally delete the auth user — cascades to profile, predictions, podio.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return { ok: false, error: delErr.message };

  return { ok: true, data: { userId } };
}
