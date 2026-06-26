import {
  computeLeaderboard,
  type LeaderboardUser,
  type Stage,
} from "./scoring";

export interface RankHistoryMatch {
  id: string;
  stage: Stage;
  /** ISO string used to sort matches chronologically. */
  kickoffAt: string;
  /** Date portion of kickoffAt, e.g. "2026-06-01" — used to group by day. */
  kickoffDate: string;
  /** rounds.name_key, e.g. "rounds.group_1" — used to group by round. */
  roundKey: string;
  /** X-axis label shown on the chart, e.g. "BRA-CRO". */
  label: string;
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
  /** One team-code label per match step, aligned with each series' ranks[]. */
  stepLabels: string[];
  /** Date per match step ("2026-06-01") — used to aggregate by day. */
  stepDates: string[];
  /** rounds.name_key per match step — used to aggregate by round. */
  stepRoundKeys: string[];
  series: RankHistorySeries[];
  playerCount: number;
}

/**
 * Derives rank-per-match-per-user without any stored history.
 *
 * For each finished match in chronological order (kickoff_at, then id as a
 * stable tiebreaker), it replays `computeLeaderboard` over the cumulative set
 * of finished matches up to that point and reads off every player's rank. Ties
 * and tie-break rules are inherited verbatim from `computeLeaderboard` /
 * `rankEntries`, so the final step matches the live leaderboard exactly (podio
 * excluded, matching the live board).
 */
export function buildRankHistory(
  users: LeaderboardUser[],
  finishedMatches: RankHistoryMatch[],
  predictions: RankHistoryPrediction[]
): RankHistory {
  // Sort chronologically; use match id as a stable tiebreaker when two matches
  // share the same kickoff_at (common in the group stage).
  const ordered = [...finishedMatches].sort((a, b) => {
    const d = a.kickoffAt.localeCompare(b.kickoffAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  const stepLabels = ordered.map((m) => m.label);
  const stepDates = ordered.map((m) => m.kickoffDate);
  const stepRoundKeys = ordered.map((m) => m.roundKey);

  const series: RankHistorySeries[] = users.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    ranks: [],
  }));
  const seriesByUser = new Map(series.map((s) => [s.userId, s]));

  const cumulative: RankHistoryMatch[] = [];
  for (const match of ordered) {
    cumulative.push(match);
    const rows = computeLeaderboard(users, cumulative, predictions);
    for (const row of rows) {
      seriesByUser.get(row.userId)?.ranks.push(row.rank);
    }
  }

  return { stepLabels, stepDates, stepRoundKeys, series, playerCount: users.length };
}
