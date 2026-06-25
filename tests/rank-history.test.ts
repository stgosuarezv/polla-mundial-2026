import { describe, it, expect } from "vitest";
import { buildRankHistory } from "../lib/scoring/rank-history";
import type { LeaderboardUser } from "../lib/scoring/scoring";

const users: LeaderboardUser[] = [
  { id: "A", displayName: "Ana" },
  { id: "B", displayName: "Bea" },
  { id: "C", displayName: "Cris" },
];

function seriesOf(
  history: ReturnType<typeof buildRankHistory>,
  userId: string
): number[] {
  return history.series.find((s) => s.userId === userId)!.ranks;
}

describe("buildRankHistory", () => {
  it("tracks a player overtaking another between rounds (monotone climb)", () => {
    // Round 0: B perfect (rank 1), A partial (rank 2).
    // Round 1: A perfect, B blank → A climbs to rank 1, B drops to rank 2.
    const matches = [
      { id: "m0", stage: "group" as const, orderIndex: 0 },
      { id: "m1", stage: "group" as const, orderIndex: 1 },
    ];
    const predictions = [
      { userId: "A", matchId: "m0", pointsAwarded: 5 },
      { userId: "B", matchId: "m0", pointsAwarded: 10 },
      { userId: "C", matchId: "m0", pointsAwarded: 0 },
      { userId: "A", matchId: "m1", pointsAwarded: 10 },
      { userId: "B", matchId: "m1", pointsAwarded: 0 },
      { userId: "C", matchId: "m1", pointsAwarded: 0 },
    ];

    const history = buildRankHistory(users, matches, predictions);

    expect(history.stepOrderIndices).toEqual([0, 1]);
    expect(seriesOf(history, "A")).toEqual([2, 1]);
    expect(seriesOf(history, "B")).toEqual([1, 2]);
    expect(seriesOf(history, "C")).toEqual([3, 3]);
  });

  it("gives every player rank 1 when all are tied at zero after round 1", () => {
    const matches = [{ id: "m0", stage: "group" as const, orderIndex: 0 }];
    const history = buildRankHistory(users, matches, []);

    for (const u of users) {
      expect(seriesOf(history, u.id)).toEqual([1]);
    }
  });

  it("breaks ties by hits, consistently with the live board", () => {
    // Same round (two group matches). A and B both total 10, but A has one
    // perfect hit (10+0) while B has none (5+5) → A ranks ahead.
    const matches = [
      { id: "m0", stage: "group" as const, orderIndex: 0 },
      { id: "m1", stage: "group" as const, orderIndex: 0 },
    ];
    const predictions = [
      { userId: "A", matchId: "m0", pointsAwarded: 10 },
      { userId: "A", matchId: "m1", pointsAwarded: 0 },
      { userId: "B", matchId: "m0", pointsAwarded: 5 },
      { userId: "B", matchId: "m1", pointsAwarded: 5 },
      { userId: "C", matchId: "m0", pointsAwarded: 0 },
      { userId: "C", matchId: "m1", pointsAwarded: 0 },
    ];

    const history = buildRankHistory(users, matches, predictions);

    expect(history.stepOrderIndices).toEqual([0]);
    expect(seriesOf(history, "A")).toEqual([1]);
    expect(seriesOf(history, "B")).toEqual([2]);
    expect(seriesOf(history, "C")).toEqual([3]);
  });

  it("only creates a step for rounds that have a finished match", () => {
    // order_index 1 has no finished match → it must be absent; points from
    // round 0 carry forward into the round-2 cumulative standing.
    const matches = [
      { id: "m0", stage: "group" as const, orderIndex: 0 },
      { id: "m2", stage: "knockout" as const, orderIndex: 2 },
    ];
    const predictions = [
      { userId: "A", matchId: "m0", pointsAwarded: 10 },
      { userId: "B", matchId: "m2", pointsAwarded: 25 },
    ];

    const history = buildRankHistory(users, matches, predictions);

    expect(history.stepOrderIndices).toEqual([0, 2]);
    // After round 0 A leads; after round 2 B's knockout points carry it ahead.
    expect(seriesOf(history, "A")).toEqual([1, 2]);
    expect(seriesOf(history, "B")).toEqual([2, 1]);
    // Every series has one rank per step.
    for (const s of history.series) expect(s.ranks).toHaveLength(2);
  });

  it("returns empty steps when no match has finished", () => {
    const history = buildRankHistory(users, [], []);
    expect(history.stepOrderIndices).toEqual([]);
    expect(history.playerCount).toBe(3);
    for (const s of history.series) expect(s.ranks).toEqual([]);
  });

  it("produces a single step from one finished round", () => {
    const matches = [{ id: "m0", stage: "group" as const, orderIndex: 0 }];
    const predictions = [{ userId: "A", matchId: "m0", pointsAwarded: 10 }];
    const history = buildRankHistory(users, matches, predictions);
    expect(history.stepOrderIndices).toHaveLength(1);
    expect(seriesOf(history, "A")).toEqual([1]);
  });
});
