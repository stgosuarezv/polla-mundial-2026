/**
 * Aggregates the pool's predictions for a single match into the summary
 * shown on the Tabla page: outcome counts, scorelines grouped per outcome
 * (bet365-style columns), mode score and average prediction.
 */

export interface ScorelineGroup {
  home: number;
  away: number;
  count: number;
  players: string[];
}

export interface OutcomeSummary {
  count: number;
  scores: ScorelineGroup[];
}

export interface MatchPredictionSummary {
  total: number;
  homeWin: OutcomeSummary;
  draw: OutcomeSummary;
  awayWin: OutcomeSummary;
  /** Most repeated exact scoreline(s) — ties included. */
  mode: { home: number; away: number; count: number }[];
  avgHome: number;
  avgAway: number;
}

export interface PredictionInput {
  home: number;
  away: number;
  player: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeMatchPredictions(
  preds: PredictionInput[]
): MatchPredictionSummary {
  const byScore = new Map<string, ScorelineGroup>();
  let sumHome = 0;
  let sumAway = 0;

  for (const p of preds) {
    sumHome += p.home;
    sumAway += p.away;
    const key = `${p.home}-${p.away}`;
    const group = byScore.get(key);
    if (group) {
      group.count++;
      group.players.push(p.player);
    } else {
      byScore.set(key, { home: p.home, away: p.away, count: 1, players: [p.player] });
    }
  }

  const groups = [...byScore.values()];
  for (const g of groups) g.players.sort((a, b) => a.localeCompare(b));
  // Most popular first; fewer total goals breaks ties so common scores lead.
  groups.sort(
    (a, b) =>
      b.count - a.count ||
      a.home + a.away - (b.home + b.away) ||
      a.home - b.home
  );

  const partition = (
    keep: (g: ScorelineGroup) => boolean
  ): OutcomeSummary => {
    const scores = groups.filter(keep);
    return { count: scores.reduce((s, g) => s + g.count, 0), scores };
  };

  const topCount = groups[0]?.count ?? 0;
  const mode = groups
    .filter((g) => g.count === topCount && topCount > 0)
    .map((g) => ({ home: g.home, away: g.away, count: g.count }));

  return {
    total: preds.length,
    homeWin: partition((g) => g.home > g.away),
    draw: partition((g) => g.home === g.away),
    awayWin: partition((g) => g.home < g.away),
    mode,
    avgHome: preds.length ? round1(sumHome / preds.length) : 0,
    avgAway: preds.length ? round1(sumAway / preds.length) : 0,
  };
}
