import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  summarizeMatchPredictions,
  type MatchPredictionSummary,
} from "@/lib/scoring/prediction-summary";

/**
 * Fetches all predictions for the given match ids and returns a
 * MatchPredictionSummary per match.
 *
 * IMPORTANT: only pass ids for matches whose round has already locked.
 * PostgREST RLS exposes other players' predictions only after the round locks;
 * for unlocked matches the result will be empty regardless.
 *
 * Uses fetchAllRows to avoid the PostgREST 1,000-row cap (50 players × many
 * matches can exceed it later in the tournament).
 */
export async function loadMatchSummaries(
  supabase: SupabaseClient,
  matchIds: string[],
  nameByUserId: Map<string, string>
): Promise<Map<string, MatchPredictionSummary>> {
  if (matchIds.length === 0) return new Map();

  const { data: rows } = await fetchAllRows<{
    user_id: string;
    match_id: string;
    home_score_pred: number;
    away_score_pred: number;
  }>((from, to) =>
    supabase
      .from("predictions")
      .select("user_id, match_id, home_score_pred, away_score_pred")
      .in("match_id", matchIds)
      .order("id")
      .range(from, to)
  );

  // Group predictions by match
  const byMatch = new Map<
    string,
    { home: number; away: number; player: string }[]
  >();
  for (const r of rows ?? []) {
    const preds = byMatch.get(r.match_id) ?? [];
    preds.push({
      home: r.home_score_pred,
      away: r.away_score_pred,
      player: nameByUserId.get(r.user_id) ?? "—",
    });
    byMatch.set(r.match_id, preds);
  }

  const result = new Map<string, MatchPredictionSummary>();
  for (const [matchId, preds] of byMatch) {
    result.set(matchId, summarizeMatchPredictions(preds));
  }
  return result;
}
