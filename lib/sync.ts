/**
 * Sync match results AND knockout team assignments from football-data.org.
 * Called from the admin server action and the scripts/sync-results.ts CLI.
 *
 * Two branches run in a single FD fetch:
 *   1. FINISHED matches → update scores / status / advancing (unchanged semantics).
 *   2. Non-finished matches with TBD team slots → fill-nulls-only team assignment.
 *      An existing non-null assignment is never overwritten.
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

interface FdTeam {
  id: number | null;
  tla: string | null;
}

export interface FdMatchResult {
  id: number;
  status: string;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: FdScore;
}

interface DbTeamSlot {
  home_team_id: string | null;
  away_team_id: string | null;
}

export interface SyncResult {
  updated: number;
  teamsAssigned: number;
  skipped: number;
  errors: string[];
}

// ── Pure helper — testable without network/DB ─────────────────────────────────

/**
 * Given our current DB row (home_team_id/away_team_id) and an FD match with
 * possibly-resolved teams, return the columns that need filling, or null if
 * there's nothing to write (both already set, or FD teams still TBD).
 *
 * Rule: only fills null slots; never overwrites an existing assignment.
 */
export function resolveTeamFill(
  row: DbTeamSlot,
  fdMatch: FdMatchResult,
  teamByCode: Map<string, string>
): { home_team_id?: string; away_team_id?: string } | null {
  const fill: { home_team_id?: string; away_team_id?: string } = {};

  if (row.home_team_id == null && fdMatch.homeTeam.id != null && fdMatch.homeTeam.tla) {
    const uuid = teamByCode.get(fdMatch.homeTeam.tla.toUpperCase());
    if (uuid) fill.home_team_id = uuid;
  }

  if (row.away_team_id == null && fdMatch.awayTeam.id != null && fdMatch.awayTeam.tla) {
    const uuid = teamByCode.get(fdMatch.awayTeam.tla.toUpperCase());
    if (uuid) fill.away_team_id = uuid;
  }

  if (Object.keys(fill).length === 0) return null;
  return fill;
}

// ── Main export ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncResults(admin: SupabaseClient<any>, apiKey: string): Promise<SyncResult> {
  // Fetch ALL WC 2026 matches so we can both update scores (FINISHED) and fill
  // team slots (upcoming/in-progress with TBD teams).
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
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

  // Build our DB team slots map (external_id → {home_team_id, away_team_id})
  // so we can skip no-op team fills without issuing an UPDATE.
  const { data: dbSlots } = await admin
    .from("matches")
    .select("external_id, home_team_id, away_team_id");
  const slotByExtId = new Map<string, DbTeamSlot>(
    (dbSlots ?? []).map(
      (r: { external_id: string; home_team_id: string | null; away_team_id: string | null }) => [
        r.external_id,
        { home_team_id: r.home_team_id, away_team_id: r.away_team_id },
      ]
    )
  );

  let updated = 0;
  let teamsAssigned = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const m of fdMatches) {
    const extId = String(m.id);

    // ── Branch 1: finished — update scores (unchanged semantics) ──────────────
    if (m.status === "FINISHED") {
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
        penaltyWinnerTeamId = teamByCode.get(winnerCode?.toUpperCase() ?? "") ?? null;
        advancingTeamId = penaltyWinnerTeamId;
      } else {
        if (homeScore > awayScore) {
          advancingTeamId = teamByCode.get(m.homeTeam.tla?.toUpperCase() ?? "") ?? null;
        } else if (awayScore > homeScore) {
          advancingTeamId = teamByCode.get(m.awayTeam.tla?.toUpperCase() ?? "") ?? null;
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
        .eq("external_id", extId)
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
      continue;
    }

    // ── Branch 2: not finished — fill any null team slots ─────────────────────
    const slot = slotByExtId.get(extId);
    if (!slot) { skipped++; continue; } // match not in our DB yet — skip

    const fill = resolveTeamFill(slot, m, teamByCode);
    if (!fill) { skipped++; continue; } // nothing to write

    const { error: fillErr } = await admin
      .from("matches")
      .update(fill)
      .eq("external_id", extId);

    if (fillErr) {
      errors.push(`Match ${m.id} (team fill): ${fillErr.message}`);
    } else {
      teamsAssigned++;
    }
  }

  return { updated, teamsAssigned, skipped, errors };
}
