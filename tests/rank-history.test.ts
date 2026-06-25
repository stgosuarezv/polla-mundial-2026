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
  it("tracks a player overtaking another between matches (chronological steps)", () => {
    // Match 0 (T1): B perfect (rank 1), A partial (rank 2).
    // Match 1 (T2): A perfect, B blank → A climbs to rank 1, B drops to rank 2.
    const matches = [
      { id: "m0", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-BBB" },
      { id: "m1", stage: "group" as const, kickoffAt: "2026-06-02T15:00:00Z", label: "CCC-DDD" },
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

    expect(history.stepLabels).toEqual(["AAA-BBB", "CCC-DDD"]);
    expect(seriesOf(history, "A")).toEqual([2, 1]);
    expect(seriesOf(history, "B")).toEqual([1, 2]);
    expect(seriesOf(history, "C")).toEqual([3, 3]);
  });

  it("gives every player rank 1 when all are tied at zero after one match", () => {
    const matches = [
      { id: "m0", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-BBB" },
    ];
    const history = buildRankHistory(users, matches, []);

    for (const u of users) {
      expect(seriesOf(history, u.id)).toEqual([1]);
    }
  });

  it("breaks ties by hits, consistently with the live board", () => {
    // Two matches with the same kickoff_at (sorted by id: m0 before m1).
    // A has one 10-pt hit + one 0; B has two 5-pt partials — same total, but
    // A ranks higher because of the 10-pt "perfect hit".
    const matches = [
      { id: "m0", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-BBB" },
      { id: "m1", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "CCC-DDD" },
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

    // Two steps: one per match (sorted by kickoffAt then id)
    expect(history.stepLabels).toEqual(["AAA-BBB", "CCC-DDD"]);
    // After m0: A=10 (1st), B=5 (2nd), C=0 (3rd)
    // After m1: A=10 total+1 hit (1st), B=10 total+0 hits (2nd), C=0 (3rd)
    expect(seriesOf(history, "A")).toEqual([1, 1]);
    expect(seriesOf(history, "B")).toEqual([2, 2]);
    expect(seriesOf(history, "C")).toEqual([3, 3]);
  });

  it("produces one step per match (including matches from different rounds)", () => {
    // Three matches across two different rounds; each becomes its own step.
    const matches = [
      { id: "m0", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-BBB" },
      { id: "m2", stage: "knockout" as const, kickoffAt: "2026-06-15T18:00:00Z", label: "EEE-FFF" },
    ];
    const predictions = [
      { userId: "A", matchId: "m0", pointsAwarded: 10 },
      { userId: "B", matchId: "m2", pointsAwarded: 25 },
    ];

    const history = buildRankHistory(users, matches, predictions);

    expect(history.stepLabels).toEqual(["AAA-BBB", "EEE-FFF"]);
    // After m0: A leads (10 pts)
    expect(seriesOf(history, "A")).toEqual([1, 2]);
    expect(seriesOf(history, "B")).toEqual([2, 1]); // B's knockout pts carry it ahead
    // Every series has one rank per step.
    for (const s of history.series) expect(s.ranks).toHaveLength(2);
  });

  it("returns empty steps when no match has finished", () => {
    const history = buildRankHistory(users, [], []);
    expect(history.stepLabels).toEqual([]);
    expect(history.playerCount).toBe(3);
    for (const s of history.series) expect(s.ranks).toEqual([]);
  });

  it("produces a single step from one finished match", () => {
    const matches = [
      { id: "m0", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-BBB" },
    ];
    const predictions = [{ userId: "A", matchId: "m0", pointsAwarded: 10 }];
    const history = buildRankHistory(users, matches, predictions);
    expect(history.stepLabels).toHaveLength(1);
    expect(history.stepLabels[0]).toBe("AAA-BBB");
    expect(seriesOf(history, "A")).toEqual([1]);
  });

  it("sorts by kickoffAt then id when two matches share the same kickoff time", () => {
    // m-alpha and m-beta both at T=0; id sort puts m-alpha before m-beta.
    const matches = [
      { id: "m-beta", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "BBB-CCC" },
      { id: "m-alpha", stage: "group" as const, kickoffAt: "2026-06-01T15:00:00Z", label: "AAA-ZZZ" },
    ];
    const history = buildRankHistory(users, matches, []);
    // m-alpha < m-beta lexicographically → m-alpha appears first
    expect(history.stepLabels).toEqual(["AAA-ZZZ", "BBB-CCC"]);
  });
});
