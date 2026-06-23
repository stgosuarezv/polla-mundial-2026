/**
 * Pure rescore helper — no admin guard, takes a service-role client directly.
 * Used by the admin action (rescoreAll) and the cron route (syncAndRescoreAsCron).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { scorePrediction, scorePodio } from "@/lib/scoring/scoring";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export async function rescoreAllWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>
): Promise<{ updated: number }> {
  // 1. All finished matches — one query
  const { data: matches, error: matchesErr } = await admin
    .from("matches")
    .select(
      "id, home_score, away_score, penalty_winner_team_id, advancing_team_id, home_team_id, away_team_id, rounds(stage)"
    )
    .eq("status", "finished");

  if (matchesErr) throw new Error(`rescore: failed to fetch matches: ${matchesErr.message}`);
  if (!matches?.length) return { updated: 0 };

  const matchById = new Map(
    (matches ?? []).map((m) => {
      const roundData = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
      const stage = roundData?.stage === "group" ? "group" : "knockout";
      return [m.id, { ...m, stage }] as const;
    })
  );

  // 2. All predictions for finished matches — one paginated fetch
  const finishedIds = [...matchById.keys()];
  const { data: preds, error: predsErr } = await fetchAllRows<{
    id: string;
    match_id: string;
    home_score_pred: number;
    away_score_pred: number;
    penalty_winner_team_id: string | null;
  }>((from, to) =>
    admin
      .from("predictions")
      .select("id, match_id, home_score_pred, away_score_pred, penalty_winner_team_id")
      .in("match_id", finishedIds)
      .order("id")
      .range(from, to)
  );

  if (predsErr) throw new Error(`rescore: failed to fetch predictions: ${predsErr}`);

  // 3. Compute all scores in TypeScript
  const updates: { id: string; points_awarded: number }[] = [];
  for (const pred of preds) {
    const match = matchById.get(pred.match_id);
    if (!match) continue;
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
      match.stage
    );
    updates.push({ id: pred.id, points_awarded: breakdown.total });
  }

  // 4. Bulk UPDATE via RPC — a true set-based UPDATE … FROM jsonb_to_recordset,
  //    which only touches points_awarded. A PostgREST upsert was used here
  //    previously but was rejected by Postgres because the partial payload
  //    (id + points_awarded only) failed NOT NULL checks on the INSERT arm,
  //    causing every rescore to silently no-op.
  if (updates.length) {
    const { error: predErr } = await admin.rpc("apply_prediction_points", {
      p_updates: updates,
    });
    if (predErr) throw new Error(`rescore: apply_prediction_points failed: ${predErr.message}`);
  }

  // 5. Podio predictions — score only when both Final and 3rd-place are done
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

      const podioUpdates = (podioPreds ?? []).map((pred) => ({
        id: pred.id,
        points_awarded: scorePodio(pred, actual),
      }));

      if (podioUpdates.length) {
        const { error: podioErr } = await admin.rpc("apply_podio_points", {
          p_updates: podioUpdates,
        });
        if (podioErr) throw new Error(`rescore: apply_podio_points failed: ${podioErr.message}`);
      }
    }
  }

  return { updated: updates.length };
}
