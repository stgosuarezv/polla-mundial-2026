export type Stage = "group" | "knockout";

export interface Prediction {
  home_score_pred: number;
  away_score_pred: number;
  penalty_winner_team_id?: string | null;
}

export interface ActualResult {
  home_score: number | null;
  away_score: number | null;
  penalty_winner_team_id?: string | null;
  advancing_team_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
}

export interface ScoreBreakdown {
  result: number;
  homeGoals: number;
  awayGoals: number;
  diffAndWinner: number;
  advance: number;
  total: number;
}

export interface PodioPrediction {
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  third_place_team_id: string | null;
}

export interface PodioActual {
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  third_place_team_id: string | null;
}

export interface LeaderboardUser {
  id: string;
  displayName: string;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  totalPoints: number;
  matchesHit: number;
  zeroMatches: number;
  deltaFromLeader: number;
}

const ZERO: ScoreBreakdown = {
  result: 0,
  homeGoals: 0,
  awayGoals: 0,
  diffAndWinner: 0,
  advance: 0,
  total: 0,
};

type MatchResult = "home" | "away" | "draw";

function winner(home: number, away: number): MatchResult {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

/**
 * Pure scoring function. Returns breakdown of points awarded for a single match prediction.
 *
 * Group stage (max 10): result 5, home goals 2, away goals 2, diff+winner 1.
 * Knockout (max 25): result 10, home goals 4, away goals 4, diff+winner 2, advance 5.
 * In knockout, a wrong result (who wins at FT/ET) scores 0 for all criteria.
 *
 * "diff+winner" is awarded when predicted goal difference equals actual AND the same
 * side wins — including draws, where diff=0 counts as "correct difference" and
 * "draw" counts as "correct winner."
 */
export function scorePrediction(
  prediction: Prediction | null | undefined,
  actual: ActualResult | null | undefined,
  stage: Stage
): ScoreBreakdown {
  if (
    !prediction ||
    actual?.home_score == null ||
    actual?.away_score == null
  ) {
    return { ...ZERO };
  }

  const { home_score_pred: hp, away_score_pred: ap } = prediction;
  const { home_score: ha, away_score: aa } = actual;

  const predResult = winner(hp, ap);
  const actualResult = winner(ha, aa);
  const resultCorrect = predResult === actualResult;

  const predDiff = hp - ap;
  const actualDiff = ha - aa;

  if (stage === "group") {
    const result = resultCorrect ? 5 : 0;
    const homeGoals = hp === ha ? 2 : 0;
    const awayGoals = ap === aa ? 2 : 0;
    const diffAndWinner =
      resultCorrect && predDiff === actualDiff ? 1 : 0;
    const total = result + homeGoals + awayGoals + diffAndWinner;
    return { result, homeGoals, awayGoals, diffAndWinner, advance: 0, total };
  }

  // Knockout: goals are independent of the result, same as group stage.
  // diffAndWinner still requires the result to be correct.
  // Advance for non-draw predictions requires result correct (no team UUIDs to
  // compare otherwise); advance for draw predictions is always independent.
  const result = resultCorrect ? 10 : 0;
  const homeGoals = hp === ha ? 4 : 0;
  const awayGoals = ap === aa ? 4 : 0;
  const diffAndWinner = resultCorrect && predDiff === actualDiff ? 2 : 0;

  let advance = 0;
  if (predResult !== "draw") {
    // Resolve the predicted advancing team UUID from home/away team IDs.
    // When team IDs are available we can award advance even if the FT result
    // criterion was wrong (e.g. predicted 2-1 home, went to pens, home advanced).
    const predictedAdvancerId =
      predResult === "home" ? actual.home_team_id ?? null : actual.away_team_id ?? null;
    const actualAdvancer = actual.advancing_team_id ?? actual.penalty_winner_team_id ?? null;
    if (predictedAdvancerId && actualAdvancer) {
      if (predictedAdvancerId === actualAdvancer) advance = 5;
    } else if (resultCorrect) {
      // Fallback when team IDs are not provided.
      advance = 5;
    }
  } else {
    // Predicted draw: compare penalty_winner against actual advancer regardless
    // of whether the FT result matched.
    const actualAdvancer =
      actual.advancing_team_id ?? actual.penalty_winner_team_id ?? null;
    if (
      prediction.penalty_winner_team_id &&
      actualAdvancer &&
      prediction.penalty_winner_team_id === actualAdvancer
    ) {
      advance = 5;
    }
  }

  const total = result + homeGoals + awayGoals + diffAndWinner + advance;
  return { result, homeGoals, awayGoals, diffAndWinner, advance, total };
}

/**
 * Scores a podio (bonus) prediction against the final tournament standings.
 * Each slot is evaluated independently. Max 90 pts (50 + 25 + 15).
 */
export function scorePodio(
  prediction: PodioPrediction | null | undefined,
  actual: PodioActual | null | undefined
): number {
  if (!prediction || !actual) return 0;
  let pts = 0;
  if (
    prediction.champion_team_id &&
    prediction.champion_team_id === actual.champion_team_id
  )
    pts += 50;
  if (
    prediction.runner_up_team_id &&
    prediction.runner_up_team_id === actual.runner_up_team_id
  )
    pts += 25;
  if (
    prediction.third_place_team_id &&
    prediction.third_place_team_id === actual.third_place_team_id
  )
    pts += 15;
  return pts;
}

/**
 * Builds a ranked leaderboard from scored predictions.
 *
 * Ranking: total points (desc) → matches hit (desc) → zero matches (asc).
 * A "hit" (acierto) is a perfect prediction: the player scored the maximum
 * points for that match — 10 in group stage, 25 in knockout. Partial scores
 * (>0 but <max) count as neither a hit nor a zero. Unsubmitted predictions
 * and 0-pt predictions on finished matches both count as zero-matches.
 *
 * @param users           All participating users.
 * @param finishedMatches IDs and stages of matches that have been fully scored.
 * @param predictions     All scored predictions (only finished matches matter).
 */
export function computeLeaderboard(
  users: LeaderboardUser[],
  finishedMatches: Array<{ id: string; stage: Stage }>,
  predictions: Array<{
    userId: string;
    matchId: string;
    pointsAwarded: number | null;
  }>
): LeaderboardRow[] {
  const maxByMatch = new Map<string, number>();
  for (const m of finishedMatches) {
    maxByMatch.set(m.id, m.stage === "group" ? 10 : 25);
  }

  const predMap = new Map<string, number>();
  for (const p of predictions) {
    if (maxByMatch.has(p.matchId)) {
      predMap.set(`${p.userId}:${p.matchId}`, p.pointsAwarded ?? 0);
    }
  }

  type UserAgg = { total: number; hit: number; zero: number };
  const agg = new Map<string, UserAgg>();

  for (const user of users) {
    let total = 0;
    let hit = 0;
    let zero = 0;
    for (const m of finishedMatches) {
      const pts = predMap.get(`${user.id}:${m.id}`) ?? 0;
      total += pts;
      const max = maxByMatch.get(m.id)!;
      if (pts === max) hit++;
      else if (pts === 0) zero++;
    }
    agg.set(user.id, { total, hit, zero });
  }

  const sorted = users.slice().sort((a, b) => {
    const sa = agg.get(a.id) ?? { total: 0, hit: 0, zero: 0 };
    const sb = agg.get(b.id) ?? { total: 0, hit: 0, zero: 0 };
    if (sb.total !== sa.total) return sb.total - sa.total;
    if (sb.hit !== sa.hit) return sb.hit - sa.hit;
    return sa.zero - sb.zero;
  });

  const leaderPoints =
    sorted.length > 0
      ? (agg.get(sorted[0]!.id) ?? { total: 0 }).total
      : 0;

  const rows: LeaderboardRow[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const user = sorted[i]!;
    const entry = agg.get(user.id) ?? { total: 0, hit: 0, zero: 0 };

    if (i > 0) {
      const prev = sorted[i - 1]!;
      const prevEntry = agg.get(prev.id) ?? { total: 0, hit: 0, zero: 0 };
      const tied =
        entry.total === prevEntry.total &&
        entry.hit === prevEntry.hit &&
        entry.zero === prevEntry.zero;
      if (!tied) currentRank = i + 1;
    }

    rows.push({
      rank: currentRank,
      userId: user.id,
      displayName: user.displayName,
      totalPoints: entry.total,
      matchesHit: entry.hit,
      zeroMatches: entry.zero,
      deltaFromLeader: entry.total - leaderPoints,
    });
  }

  return rows;
}
