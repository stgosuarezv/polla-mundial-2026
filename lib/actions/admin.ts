"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scorePrediction, scorePodio } from "@/lib/scoring/scoring";
import { syncResults } from "@/lib/sync";

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

  return { ok: true, data: { matchId } };
}

// ── Rescore all finished matches ───────────────────────────────────────────────

export async function rescoreAll(): Promise<ActionResult<{ updated: number }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const admin = createAdminClient();

  // Fetch all finished matches with their round stage
  const { data: matches, error: matchErr } = await admin
    .from("matches")
    .select("id, home_score, away_score, penalty_winner_team_id, advancing_team_id, home_team_id, away_team_id, rounds(stage)")
    .eq("status", "finished");

  if (matchErr) return { ok: false, error: matchErr.message };
  if (!matches?.length) return { ok: true, data: { updated: 0 } };

  let updated = 0;

  for (const match of matches) {
    const roundData = Array.isArray(match.rounds) ? match.rounds[0] : match.rounds;
    const stage = roundData?.stage === "group" ? "group" : "knockout";

    const { data: preds } = await admin
      .from("predictions")
      .select("id, home_score_pred, away_score_pred, penalty_winner_team_id")
      .eq("match_id", match.id);

    if (!preds?.length) continue;

    for (const pred of preds) {
      const breakdown = scorePrediction(
        {
          home_score_pred: pred.home_score_pred,
          away_score_pred: pred.away_score_pred,
          penalty_winner_team_id: pred.penalty_winner_team_id,
        },
        {
          home_score: match.home_score,
          away_score: match.away_score,
          penalty_winner_team_id: match.penalty_winner_team_id,
          advancing_team_id: match.advancing_team_id,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
        },
        stage
      );

      await admin
        .from("predictions")
        .update({ points_awarded: breakdown.total })
        .eq("id", pred.id);

      updated++;
    }
  }

  // Score podio predictions if Final and 3rd Place matches are finished
  const { data: finalRound } = await admin
    .from("rounds")
    .select("id")
    .eq("name_key", "rounds.knockout_final")
    .single();

  const { data: thirdRound } = await admin
    .from("rounds")
    .select("id")
    .eq("name_key", "rounds.knockout_3rd")
    .single();

  if (finalRound && thirdRound) {
    const { data: finalMatch } = await admin
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, advancing_team_id")
      .eq("round_id", finalRound.id)
      .eq("status", "finished")
      .maybeSingle();

    const { data: thirdMatch } = await admin
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, advancing_team_id")
      .eq("round_id", thirdRound.id)
      .eq("status", "finished")
      .maybeSingle();

    if (finalMatch && thirdMatch) {
      const champion =
        finalMatch.advancing_team_id ??
        (finalMatch.home_score > finalMatch.away_score
          ? finalMatch.home_team_id
          : finalMatch.away_team_id);
      const runnerUp =
        champion === finalMatch.home_team_id
          ? finalMatch.away_team_id
          : finalMatch.home_team_id;
      const thirdPlace =
        thirdMatch.advancing_team_id ??
        (thirdMatch.home_score > thirdMatch.away_score
          ? thirdMatch.home_team_id
          : thirdMatch.away_team_id);

      const actual = {
        champion_team_id: champion,
        runner_up_team_id: runnerUp,
        third_place_team_id: thirdPlace,
      };

      const { data: podioPreds } = await admin
        .from("podio_predictions")
        .select("id, champion_team_id, runner_up_team_id, third_place_team_id");

      for (const pred of podioPreds ?? []) {
        const pts = scorePodio(pred, actual);
        await admin.from("podio_predictions").update({ points_awarded: pts }).eq("id", pred.id);
      }
    }
  }

  return { ok: true, data: { updated } };
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
  const admin = createAdminClient();

  const { error } = await admin
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
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
