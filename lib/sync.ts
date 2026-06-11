/**
 * Sync match results from football-data.org to our database.
 * Called from the admin server action and the scripts/sync-results.ts CLI.
 */

import { SupabaseClient } from "@supabase/supabase-js";

interface FdScore {
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
  extraTime?: { home: number | null; away: number | null } | null;
  penalties?: { home: number | null; away: number | null } | null;
}

interface FdMatchResult {
  id: number;
  status: string;
  homeTeam: { id: number; tla: string };
  awayTeam: { id: number; tla: string };
  score: FdScore;
}

interface SyncResult {
  updated: number;
  skipped: number;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncResults(admin: SupabaseClient<any>, apiKey: string): Promise<SyncResult> {
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED",
    { headers: { "X-Auth-Token": apiKey } }
  );

  if (!res.ok) {
    throw new Error(`football-data.org error: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { matches: FdMatchResult[] };
  const fdMatches = json.matches ?? [];

  // Build team code → our UUID map
  const { data: teams } = await admin.from("teams").select("id, code");
  const teamByCode = new Map<string, string>(
    (teams ?? []).map((t: { id: string; code: string }) => [t.code, t.id])
  );

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const m of fdMatches) {
    if (m.status !== "FINISHED") { skipped++; continue; }

    const ft = m.score.fullTime;
    const et = m.score.extraTime ?? null;

    if (ft.home == null || ft.away == null) { skipped++; continue; }

    // Score at end of regulation or ET (not including penalty shootout goals)
    const homeScore =
      et?.home != null ? ft.home + et.home : ft.home;
    const awayScore =
      et?.away != null ? ft.away + et.away : ft.away;

    // Penalty winner (knockout matches only)
    let penaltyWinnerTeamId: string | null = null;
    let advancingTeamId: string | null = null;

    if (m.score.penalties) {
      const pHome = m.score.penalties.home ?? 0;
      const pAway = m.score.penalties.away ?? 0;
      const winnerCode = pHome > pAway ? m.homeTeam.tla : m.awayTeam.tla;
      penaltyWinnerTeamId = teamByCode.get(winnerCode?.toUpperCase()) ?? null;
      advancingTeamId = penaltyWinnerTeamId;
    } else {
      // Clear winner in regular or extra time
      if (homeScore > awayScore) {
        advancingTeamId = teamByCode.get(m.homeTeam.tla?.toUpperCase()) ?? null;
      } else if (awayScore > homeScore) {
        advancingTeamId = teamByCode.get(m.awayTeam.tla?.toUpperCase()) ?? null;
      }
    }

    const { data: updatedRows, error } = await admin
      .from("matches")
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: "finished",
        penalty_winner_team_id: penaltyWinnerTeamId,
        advancing_team_id: advancingTeamId,
      })
      .eq("external_id", String(m.id))
      .select("id");

    if (error) {
      errors.push(`Match ${m.id}: ${error.message}`);
    } else if (!updatedRows?.length) {
      // 0-row update is not a PostgREST error — surface it instead of
      // counting it as a successful sync.
      errors.push(`Match ${m.id}: no match row with this external_id`);
    } else {
      updated++;
    }
  }

  return { updated, skipped, errors };
}
