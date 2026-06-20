import { describe, it, expect } from "vitest";
import {
  oracleConsensus,
  oracleVerdict,
  actualOutcome,
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

describe("oracleVerdict", () => {
  it("is a hit when the favorite matches the real outcome", () => {
    expect(oracleVerdict("home", 2, 1)).toBe("hit");
    expect(oracleVerdict("draw", 1, 1)).toBe("hit");
    expect(oracleVerdict("away", 0, 3)).toBe("hit");
  });

  it("is a miss when the favorite is wrong", () => {
    expect(oracleVerdict("home", 0, 2)).toBe("miss");
    expect(oracleVerdict("draw", 2, 1)).toBe("miss");
  });

  it("derives the actual outcome from the scoreline", () => {
    expect(actualOutcome(3, 0)).toBe("home");
    expect(actualOutcome(0, 0)).toBe("draw");
    expect(actualOutcome(1, 2)).toBe("away");
  });
});
