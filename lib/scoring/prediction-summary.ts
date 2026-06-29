/**
 * Aggregates the pool's predictions for a single match into the summary
 * shown on the Tabla page: outcome counts, scorelines grouped per outcome
 * (bet365-style columns), mode score and average prediction.
 */

export interface ScorelineGroup {
  home: number;
  away: number;
  /** Team code of the predicted penalty-round advancer (knockout draws only). */
  advancer?: string | null;
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
  /** Team code of the predicted penalty-round advancer (knockout draws only). */
  advancer?: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeMatchPredictions(
  preds: PredictionInput[]
): MatchPredictionSummary {
  // byScore groups by scoreline + advancer (for knockout draws) so that e.g.
  // "1–1 (BRA)" and "1–1 (JPN)" appear as separate chips in the draw column.
  const byScore = new Map<string, ScorelineGroup>();
  // pureScoreCount tracks counts by plain scoreline only, used to compute the
  // mode — we don't want a split draw to misrepresent the most-predicted score.
  const pureScoreCount = new Map<string, { home: number; away: number; count: number }>();
  let sumHome = 0;
  let sumAway = 0;

  for (const p of preds) {
    sumHome += p.home;
    sumAway += p.away;

    // Include the advancer in the key only when it's provided (knockout draws).
    const key = p.advancer ? `${p.home}-${p.away}|${p.advancer}` : `${p.home}-${p.away}`;
    const group = byScore.get(key);
    if (group) {
      group.count++;
      group.players.push(p.player);
    } else {
      byScore.set(key, {
        home: p.home,
        away: p.away,
        advancer: p.advancer ?? null,
        count: 1,
        players: [p.player],
      });
    }

    // Pure-scoreline count for mode computation.
    const pureKey = `${p.home}-${p.away}`;
    const pure = pureScoreCount.get(pureKey);
    if (pure) {
      pure.count++;
    } else {
      pureScoreCount.set(pureKey, { home: p.home, away: p.away, count: 1 });
    }
  }

  const groups = [...byScore.values()];
  for (const g of groups) g.players.sort((a, b) => a.localeCompare(b));
  // Most popular first; fewer total goals breaks ties so common scores lead;
  // advancer code breaks ties within a split draw (deterministic ordering).
  groups.sort(
    (a, b) =>
      b.count - a.count ||
      a.home + a.away - (b.home + b.away) ||
      a.home - b.home ||
      (a.advancer ?? "").localeCompare(b.advancer ?? "")
  );

  const partition = (
    keep: (g: ScorelineGroup) => boolean
  ): OutcomeSummary => {
    const scores = groups.filter(keep);
    return { count: scores.reduce((s, g) => s + g.count, 0), scores };
  };

  // Mode is derived from pure-scoreline counts so a split draw doesn't fragment
  // the top score into two smaller counts, hiding the true mode.
  const pureGroups = [...pureScoreCount.values()];
  const topCount = Math.max(0, ...pureGroups.map((g) => g.count));
  const mode = pureGroups
    .filter((g) => g.count === topCount && topCount > 0)
    .sort(
      (a, b) =>
        a.home + a.away - (b.home + b.away) ||
        a.home - b.home
    )
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
