import {
  computeLeaderboard,
  type LeaderboardUser,
  type Stage,
} from "./scoring";

export interface RankHistoryMatch {
  id: string;
  stage: Stage;
  orderIndex: number;
}

export interface RankHistoryPrediction {
  userId: string;
  matchId: string;
  pointsAwarded: number | null;
}

export interface RankHistorySeries {
  userId: string;
  displayName: string;
  ranks: number[];
}

export interface RankHistory {
  stepOrderIndices: number[];
  series: RankHistorySeries[];
  playerCount: number;
}

/**
 * Derives rank-per-round-per-user without any stored history.
 *
 * For each distinct round (by `order_index`, ascending) that has at least one
 * finished match, it replays `computeLeaderboard` over the cumulative set of
 * finished matches up to that round and reads off every player's rank. Ties and
 * tie-break rules are inherited verbatim from `computeLeaderboard` /
 * `rankEntries`, so the final step matches the live leaderboard exactly (podio
 * excluded, matching the live board).
 */
export function buildRankHistory(
  users: LeaderboardUser[],
  finishedMatches: RankHistoryMatch[],
  predictions: RankHistoryPrediction[]
): RankHistory {
  const stepOrderIndices = [
    ...new Set(finishedMatches.map((m) => m.orderIndex)),
  ].sort((a, b) => a - b);

  const series: RankHistorySeries[] = users.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    ranks: [],
  }));
  const seriesByUser = new Map(series.map((s) => [s.userId, s]));

  for (const boundary of stepOrderIndices) {
    const matchesSoFar = finishedMatches.filter(
      (m) => m.orderIndex <= boundary
    );
    const rows = computeLeaderboard(users, matchesSoFar, predictions);
    for (const row of rows) {
      seriesByUser.get(row.userId)?.ranks.push(row.rank);
    }
  }

  return { stepOrderIndices, series, playerCount: users.length };
}
