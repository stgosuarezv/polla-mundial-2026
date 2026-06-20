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
 * Did the pool's consensus call the real result? "hit" if the group's favorite
 * outcome matches what actually happened, else "miss". Purely informational.
 */
export function oracleVerdict(
  favorite: Outcome,
  homeScore: number,
  awayScore: number
): "hit" | "miss" {
  return favorite === actualOutcome(homeScore, awayScore) ? "hit" : "miss";
}
