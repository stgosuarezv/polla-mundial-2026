import { describe, it, expect } from "vitest";
import {
  oracleConsensus,
  oracleVerdict,
  actualOutcome,
  finishedOutcome,
} from "../lib/scoring/oracle";
import type { MatchPredictionSummary } from "../lib/scoring/prediction-summary";

function summary(
  home: number,
  draw: number,
  away: number
): MatchPredictionSummary {
  return {
    total: home + draw + away,
    homeWin: { count: home, scores: [] },
    draw: { count: draw, scores: [] },
    awayWin: { count: away, scores: [] },
    mode: [],
    avgHome: 0,
    avgAway: 0,
  };
}

describe("oracleConsensus", () => {
  it("picks the outcome with the most votes and reports shares", () => {
    const c = oracleConsensus(summary(26, 7, 5)); // 38 total
    expect(c.favorite).toBe("home");
    expect(c.total).toBe(38);
    expect(c.favoriteCount).toBe(26);
    expect(c.shares.home).toBeCloseTo(26 / 38);
    expect(c.shares.draw).toBeCloseTo(7 / 38);
    expect(c.shares.away).toBeCloseTo(5 / 38);
  });

  it("backs the away side when it leads", () => {
    expect(oracleConsensus(summary(3, 4, 20)).favorite).toBe("away");
  });

  it("backs a draw when it leads", () => {
    expect(oracleConsensus(summary(2, 9, 3)).favorite).toBe("draw");
  });

  it("breaks ties deterministically: home over away over draw", () => {
    expect(oracleConsensus(summary(5, 5, 5)).favorite).toBe("home");
    expect(oracleConsensus(summary(0, 5, 5)).favorite).toBe("away");
  });

  it("handles an empty pool without dividing by zero", () => {
    const c = oracleConsensus(summary(0, 0, 0));
    expect(c.total).toBe(0);
    expect(c.shares).toEqual({ home: 0, draw: 0, away: 0 });
  });
});

describe("actualOutcome", () => {
  it("derives the actual outcome from the scoreline", () => {
    expect(actualOutcome(3, 0)).toBe("home");
    expect(actualOutcome(0, 0)).toBe("draw");
    expect(actualOutcome(1, 2)).toBe("away");
  });
});

describe("finishedOutcome", () => {
  const base = {
    homeTeamId: "team-a",
    awayTeamId: "team-b",
    advancingTeamId: null,
    penaltyWinnerTeamId: null,
  };

  it("returns home when home score is higher (any stage)", () => {
    expect(
      finishedOutcome({ ...base, homeScore: 2, awayScore: 1, stage: "group" })
    ).toBe("home");
    expect(
      finishedOutcome({ ...base, homeScore: 2, awayScore: 1, stage: "knockout" })
    ).toBe("home");
  });

  it("returns away when away score is higher", () => {
    expect(
      finishedOutcome({ ...base, homeScore: 0, awayScore: 1, stage: "group" })
    ).toBe("away");
  });

  it("returns draw for a level group-stage match", () => {
    expect(
      finishedOutcome({ ...base, homeScore: 1, awayScore: 1, stage: "group" })
    ).toBe("draw");
  });

  it("resolves a knockout level score via advancingTeamId", () => {
    expect(
      finishedOutcome({
        ...base,
        homeScore: 1,
        awayScore: 1,
        stage: "knockout",
        advancingTeamId: "team-a",
      })
    ).toBe("home");
    expect(
      finishedOutcome({
        ...base,
        homeScore: 1,
        awayScore: 1,
        stage: "knockout",
        advancingTeamId: "team-b",
      })
    ).toBe("away");
  });

  it("falls back to penaltyWinnerTeamId when advancingTeamId is absent", () => {
    expect(
      finishedOutcome({
        ...base,
        homeScore: 1,
        awayScore: 1,
        stage: "knockout",
        penaltyWinnerTeamId: "team-b",
      })
    ).toBe("away");
  });

  it("falls back to draw when no decider is recorded", () => {
    expect(
      finishedOutcome({
        ...base,
        homeScore: 1,
        awayScore: 1,
        stage: "knockout",
      })
    ).toBe("draw");
  });
});

describe("oracleVerdict", () => {
  it("is a hit when the favorite matches the real outcome", () => {
    expect(oracleVerdict("home", "home")).toBe("hit");
    expect(oracleVerdict("draw", "draw")).toBe("hit");
    expect(oracleVerdict("away", "away")).toBe("hit");
  });

  it("is a miss when the favorite is wrong", () => {
    expect(oracleVerdict("home", "away")).toBe("miss");
    expect(oracleVerdict("draw", "home")).toBe("miss");
  });
});
