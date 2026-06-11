import { describe, it, expect } from "vitest";
import {
  summarizeMatchPredictions,
  type PredictionInput,
} from "@/lib/scoring/prediction-summary";

const p = (home: number, away: number, player: string): PredictionInput => ({
  home,
  away,
  player,
});

describe("summarizeMatchPredictions", () => {
  it("returns an empty summary for no predictions", () => {
    const s = summarizeMatchPredictions([]);
    expect(s.total).toBe(0);
    expect(s.homeWin).toEqual({ count: 0, scores: [] });
    expect(s.draw).toEqual({ count: 0, scores: [] });
    expect(s.awayWin).toEqual({ count: 0, scores: [] });
    expect(s.mode).toEqual([]);
    expect(s.avgHome).toBe(0);
    expect(s.avgAway).toBe(0);
  });

  it("partitions scorelines into home win / draw / away win", () => {
    const s = summarizeMatchPredictions([
      p(2, 0, "a"),
      p(2, 0, "b"),
      p(1, 0, "c"),
      p(1, 1, "d"),
      p(0, 0, "e"),
      p(0, 1, "f"),
    ]);
    expect(s.total).toBe(6);
    expect(s.homeWin.count).toBe(3);
    expect(s.homeWin.scores.map((g) => `${g.home}-${g.away}`)).toEqual([
      "2-0",
      "1-0",
    ]);
    expect(s.draw.count).toBe(2);
    expect(s.draw.scores.map((g) => `${g.home}-${g.away}`)).toEqual([
      "0-0",
      "1-1",
    ]);
    expect(s.awayWin.count).toBe(1);
    expect(s.awayWin.scores.map((g) => `${g.home}-${g.away}`)).toEqual(["0-1"]);
  });

  it("groups players per scoreline, sorted alphabetically", () => {
    const s = summarizeMatchPredictions([
      p(2, 1, "zoe"),
      p(2, 1, "ana"),
      p(2, 1, "mia"),
    ]);
    expect(s.homeWin.scores).toHaveLength(1);
    expect(s.homeWin.scores[0]!.count).toBe(3);
    expect(s.homeWin.scores[0]!.players).toEqual(["ana", "mia", "zoe"]);
  });

  it("sorts scorelines by count desc, then fewer total goals", () => {
    const s = summarizeMatchPredictions([
      p(3, 1, "a"),
      p(3, 1, "b"),
      p(1, 0, "c"),
      p(1, 0, "d"),
      p(2, 0, "e"),
    ]);
    // 1-0 (×2, 1 goal) before 3-1 (×2, 4 goals), then 2-0 (×1)
    expect(s.homeWin.scores.map((g) => `${g.home}-${g.away}`)).toEqual([
      "1-0",
      "3-1",
      "2-0",
    ]);
  });

  it("computes the mode including ties", () => {
    const s = summarizeMatchPredictions([
      p(2, 0, "a"),
      p(2, 0, "b"),
      p(1, 1, "c"),
      p(1, 1, "d"),
      p(0, 1, "e"),
    ]);
    expect(s.mode).toEqual([
      { home: 1, away: 1, count: 2 },
      { home: 2, away: 0, count: 2 },
    ]);
  });

  it("computes single mode when one scoreline dominates", () => {
    const s = summarizeMatchPredictions([
      p(2, 1, "a"),
      p(2, 1, "b"),
      p(0, 0, "c"),
    ]);
    expect(s.mode).toEqual([{ home: 2, away: 1, count: 2 }]);
  });

  it("computes averages rounded to one decimal", () => {
    const s = summarizeMatchPredictions([
      p(2, 0, "a"),
      p(1, 1, "b"),
      p(3, 1, "c"),
    ]);
    expect(s.avgHome).toBe(2); // (2+1+3)/3
    expect(s.avgAway).toBe(0.7); // (0+1+1)/3 = 0.666…
  });
});
