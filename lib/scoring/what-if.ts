/**
 * Pure helpers for the client-side "What if?" simulator.
 *
 * Types are exported so both `scoreboard-table.tsx` (the consumer) and
 * `page.tsx` (which maps DB rows into these shapes) share one definition.
 * No React / browser deps — safe to unit-test in Node.
 */

import {
  scorePrediction,
  rankEntries,
  type LeaderboardRow,
  type Stage,
} from "@/lib/scoring/scoring";

// ── Shared types ───────────────────────────────────────────────────────────────

export interface WhatIfMatch {
  id: string;
  roundId: string;
  roundKey: string;        // translation key without "rounds." prefix, e.g. "group_1"
  roundOrderIndex: number;
  stage: Stage;
  status: string; // "finished" | "scheduled" | "in_progress"
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffLabel: string;
  actual: {
    home: number;
    away: number;
    advancingTeamId: string | null;
  } | null;
}

/** Each player's stored prediction for a single match. */
export interface WhatIfPredEntry {
  home: number;
  away: number;
  penaltyWinnerId: string | null;
}

/** Mutable state held in the score inputs for one match. */
export interface MatchInput {
  home: string | number; // "" when blank (upcoming, not yet entered)
  away: string | number;
  advancingTeamId: string; // knockout draw: which team advances
}

// ── Input completeness ─────────────────────────────────────────────────────────

/**
 * A match input is considered complete (usable in the projection) only when
 * BOTH the home and away score boxes are filled.
 *
 * Used by both the projection logic and the "next unsimulated match" finder so
 * the two sites can never disagree about what constitutes a valid input.
 */
export function isMatchInputComplete(inp: MatchInput | undefined): boolean {
  return (
    inp != null &&
    inp.home !== "" && inp.home !== undefined &&
    inp.away !== "" && inp.away !== undefined
  );
}

// ── Default inputs ─────────────────────────────────────────────────────────────

/**
 * Build the initial input map: finished matches pre-fill with the real result;
 * upcoming / in-progress matches start blank.
 */
export function buildDefaultInputs(
  matches: WhatIfMatch[]
): Record<string, MatchInput> {
  const defaults: Record<string, MatchInput> = {};
  for (const m of matches) {
    if (m.status === "finished" && m.actual) {
      defaults[m.id] = {
        home: m.actual.home,
        away: m.actual.away,
        advancingTeamId: m.actual.advancingTeamId ?? "",
      };
    } else {
      defaults[m.id] = { home: "", away: "", advancingTeamId: "" };
    }
  }
  return defaults;
}

// ── Projection ─────────────────────────────────────────────────────────────────

export interface ProjectionResult {
  projected: LeaderboardRow[];
  gainByUserId: Map<string, number>;
  anyChange: boolean;
}

/**
 * Computes hypothetical standings by applying the user's score inputs on top
 * of the real baseline.
 *
 * - Finished matches: base points come from `realPtsByKey` (already-awarded pts).
 * - Upcoming matches: base points are 0 (not yet played).
 * - Matches with blank inputs are skipped (no change to that match's contribution).
 * - Knockout draws: advancing team is whatever the user selected in `inputs[id].advancingTeamId`.
 */
export function projectStandings(
  baseline: LeaderboardRow[],
  matches: WhatIfMatch[],
  inputs: Record<string, MatchInput>,
  predByKey: Record<string, WhatIfPredEntry>,
  realPtsByKey: Record<string, number>
): ProjectionResult {
  // Per-player aggregates, seeded from real standings
  const agg = new Map(
    baseline.map((r) => [
      r.userId,
      {
        userId: r.userId,
        displayName: r.displayName,
        total: r.totalPoints,
        hit: r.matchesHit,
        zero: r.zeroMatches,
        gain: 0,
      },
    ])
  );

  let anyChange = false;

  for (const m of matches) {
    const inp = inputs[m.id];

    // Skip if either score box is blank (uses shared predicate so this check
    // stays in sync with the "next unsimulated match" finder in the table).
    if (!isMatchInputComplete(inp)) continue;
    // inp is guaranteed non-undefined by isMatchInputComplete (TS can't infer this).
    const safeInp = inp!;

    const homeVal = Number(safeInp.home);
    const awayVal = Number(safeInp.away);

    const max = m.stage === "group" ? 10 : 25;

    // For knockout draws, use the user-picked advancing team
    const enteredDraw = m.stage === "knockout" && homeVal === awayVal;
    const chosenAdvancingId = enteredDraw ? safeInp.advancingTeamId || null : null;

    for (const [userId, entry] of agg) {
      // What the match currently contributes to the real standings
      const baseKey = `${userId}:${m.id}`;
      const basePts =
        m.status === "finished" ? (realPtsByKey[baseKey] ?? 0) : 0;
      const baseIsHit = m.status === "finished" && basePts === max;
      const baseIsZero = m.status === "finished" && basePts === 0;

      // The player's stored prediction for this match
      const pred = predByKey[baseKey] ?? null;

      // Determine simulated advancing team for knockout
      let simAdvancingTeamId: string | null = null;
      if (m.stage === "knockout") {
        if (homeVal > awayVal) {
          simAdvancingTeamId = m.homeTeamId;
        } else if (awayVal > homeVal) {
          simAdvancingTeamId = m.awayTeamId;
        } else {
          simAdvancingTeamId = chosenAdvancingId;
        }
      }

      const breakdown = scorePrediction(
        pred
          ? {
              home_score_pred: pred.home,
              away_score_pred: pred.away,
              penalty_winner_team_id: pred.penaltyWinnerId,
            }
          : null,
        {
          home_score: homeVal,
          away_score: awayVal,
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          advancing_team_id: simAdvancingTeamId,
          penalty_winner_team_id: simAdvancingTeamId,
        },
        m.stage
      );

      const simPts = breakdown.total;
      const simIsHit = simPts === max;
      const simIsZero = simPts === 0;

      const delta = simPts - basePts;
      const hitDelta = (simIsHit ? 1 : 0) - (baseIsHit ? 1 : 0);
      const zeroDelta = (simIsZero ? 1 : 0) - (baseIsZero ? 1 : 0);

      if (delta !== 0 || hitDelta !== 0 || zeroDelta !== 0) {
        anyChange = true;
        entry.total += delta;
        entry.hit += hitDelta;
        entry.zero += zeroDelta;
        entry.gain += delta;
      }
    }
  }

  const entries = [...agg.values()];
  const projected = rankEntries(entries);
  const gainByUserId = new Map(entries.map((e) => [e.userId, e.gain]));

  return { projected, gainByUserId, anyChange };
}
