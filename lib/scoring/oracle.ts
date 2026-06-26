import type { MatchPredictionSummary } from "./prediction-summary";

export type Outcome = "home" | "draw" | "away";

export interface OracleConsensus {
  /** Outcome the pool backs most. Ties break home → away → draw. */
  favorite: Outcome;
  /** Vote share per outcome as a fraction 0..1. */
  shares: { home: number; draw: number; away: number };
  favoriteCount: number;
  total: number;
}

/**
 * Distils the pool's per-match prediction summary into a single "consensus"
 * call: who the group backs and by how much. Pure re-shaping of data already
 * computed by `summarizeMatchPredictions` — no scoring, no money.
 */
export function oracleConsensus(
  summary: MatchPredictionSummary
): OracleConsensus {
  const total = summary.total;
  const home = summary.homeWin.count;
  const draw = summary.draw.count;
  const away = summary.awayWin.count;

  const shares = total
    ? { home: home / total, draw: draw / total, away: away / total }
    : { home: 0, draw: 0, away: 0 };

  const ranked: Array<[Outcome, number]> = [
    ["home", home],
    ["away", away],
    ["draw", draw],
  ];
  ranked.sort((a, b) => b[1] - a[1]);

  return {
    favorite: ranked[0]![0],
    shares,
    favoriteCount: ranked[0]![1],
    total,
  };
}

export function actualOutcome(homeScore: number, awayScore: number): Outcome {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

/**
 * Resolves the true outcome of a finished match, handling knockout deciders.
 *
 * For group-stage draws the result is "draw". For knockout draws (e.g. 1–1
 * after extra time), the real outcome is derived from `advancingTeamId` (or
 * `penaltyWinnerTeamId` as fallback), matched against the home/away team ids.
 * If scores differ the winner is clear regardless of stage. Falls back to
 * "draw" when the decider field isn't populated yet.
 */
export function finishedOutcome(opts: {
  homeScore: number;
  awayScore: number;
  /** Round stage from the DB — "group" or "knockout". */
  stage: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  advancingTeamId: string | null;
  penaltyWinnerTeamId: string | null;
}): Outcome {
  if (opts.homeScore > opts.awayScore) return "home";
  if (opts.awayScore > opts.homeScore) return "away";
  // Level scores — group stage is a genuine draw; knockout has a decider.
  if (opts.stage !== "knockout") return "draw";
  const decider = opts.advancingTeamId ?? opts.penaltyWinnerTeamId;
  if (!decider) return "draw"; // data not yet populated — defensive fallback
  if (decider === opts.homeTeamId) return "home";
  if (decider === opts.awayTeamId) return "away";
  return "draw";
}

/**
 * Did the pool's consensus call the real result? "hit" if the group's favorite
 * outcome matches what actually happened, else "miss". Purely informational.
 *
 * Pass `actual` computed via `finishedOutcome` so knockout deciders are
 * respected (e.g. a 1–1 penalty win is "home"/"away", not "draw").
 */
export function oracleVerdict(
  favorite: Outcome,
  actual: Outcome
): "hit" | "miss" {
  return favorite === actual ? "hit" : "miss";
}
