/**
 * Pure rescore helper — no admin guard, takes a service-role client directly.
 * Used by the admin action (rescoreAll) and the cron route (syncAndRescoreAsCron).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { scorePrediction, scorePodio } from "@/lib/scoring/scoring";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

const UPSERT_BATCH = 500;

export async function rescoreAllWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>
): Promise<{ updated: number }> {
  // 1. All finished matches — one query
  const { data: matches } = await admin
    .from("matches")
    .select(
      "id, home_score, away_score, penalty_winner_team_id, advancing_team_id, home_team_id, away_team_id, rounds(stage)"
    )
    .eq("status", "finished");

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
  const { data: preds } = await fetchAllRows<{
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

  // 4. Bulk upsert in batches (conflict on primary key → only points_awarded updated)
  for (let i = 0; i < updates.length; i += UPSERT_BATCH) {
    await admin
      .from("predictions")
      .upsert(updates.slice(i, i + UPSERT_BATCH), { onConflict: "id" });
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
        await admin
          .from("podio_predictions")
          .upsert(podioUpdates, { onConflict: "id" });
      }
    }
  }

  return { updated: updates.length };
}
