/**
 * Pure rescore helper — no admin guard, takes a service-role client directly.
 * Used by the admin action (rescoreAll) and the cron route (syncAndRescoreAsCron).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { scorePrediction, scorePodio } from "@/lib/scoring/scoring";

export async function rescoreAllWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>
): Promise<{ updated: number }> {
  const { data: matches } = await admin
    .from("matches")
    .select(
      "id, home_score, away_score, penalty_winner_team_id, advancing_team_id, home_team_id, away_team_id, rounds(stage)"
    )
    .eq("status", "finished");

  let updated = 0;

  for (const match of matches ?? []) {
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

  // Score podio predictions if both Final and 3rd-place matches are finished
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
        await admin
          .from("podio_predictions")
          .update({ points_awarded: pts })
          .eq("id", pred.id);
      }
    }
  }

  return { updated };
}
