import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  summarizeMatchPredictions,
  type MatchPredictionSummary,
} from "@/lib/scoring/prediction-summary";

export interface MatchMeta {
  knockout: boolean;
  homeTeamId: string | null;
  homeCode: string;
  awayTeamId: string | null;
  awayCode: string;
}

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
 *
 * @param matchMeta - Optional per-match metadata used to resolve the penalty-
 *   winner advancer for knockout draws. When provided, drawn predictions for
 *   knockout matches are split by who the player picked to advance, so e.g.
 *   "1–1 (BRA)" and "1–1 (JPN)" appear as separate chips in the stats card.
 */
export async function loadMatchSummaries(
  supabase: SupabaseClient,
  matchIds: string[],
  nameByUserId: Map<string, string>,
  matchMeta?: Map<string, MatchMeta>
): Promise<Map<string, MatchPredictionSummary>> {
  if (matchIds.length === 0) return new Map();

  const { data: rows } = await fetchAllRows<{
    user_id: string;
    match_id: string;
    home_score_pred: number;
    away_score_pred: number;
    penalty_winner_team_id: string | null;
  }>((from, to) =>
    supabase
      .from("predictions")
      .select("user_id, match_id, home_score_pred, away_score_pred, penalty_winner_team_id")
      .in("match_id", matchIds)
      .order("id")
      .range(from, to)
  );

  // Group predictions by match
  const byMatch = new Map<
    string,
    { home: number; away: number; player: string; advancer?: string | null }[]
  >();
  for (const r of rows ?? []) {
    const preds = byMatch.get(r.match_id) ?? [];
    const meta = matchMeta?.get(r.match_id);
    // Resolve advancer to a team code for knockout draws only.
    let advancer: string | null = null;
    if (
      meta?.knockout &&
      r.home_score_pred === r.away_score_pred &&
      r.penalty_winner_team_id
    ) {
      advancer =
        r.penalty_winner_team_id === meta.homeTeamId
          ? meta.homeCode
          : meta.awayCode;
    }
    preds.push({
      home: r.home_score_pred,
      away: r.away_score_pred,
      player: nameByUserId.get(r.user_id) ?? "—",
      advancer,
    });
    byMatch.set(r.match_id, preds);
  }

  const result = new Map<string, MatchPredictionSummary>();
  for (const [matchId, preds] of byMatch) {
    result.set(matchId, summarizeMatchPredictions(preds));
  }
  return result;
}
