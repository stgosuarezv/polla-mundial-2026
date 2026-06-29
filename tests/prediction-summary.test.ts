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

const pAdv = (
  home: number,
  away: number,
  player: string,
  advancer: string | null
): PredictionInput => ({ home, away, player, advancer });

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

  describe("knockout draw splitting by advancer", () => {
    it("splits drawn scorelines by advancer in the draw column", () => {
      const s = summarizeMatchPredictions([
        pAdv(1, 1, "ana", "BRA"),
        pAdv(1, 1, "bob", "BRA"),
        pAdv(1, 1, "cat", "JPN"),
        pAdv(0, 0, "dan", "BRA"),
      ]);
      // draw column: "1-1 (BRA)" ×2, "0-0 (BRA)" ×1, "1-1 (JPN)" ×1
      expect(s.draw.count).toBe(4);
      const drawKeys = s.draw.scores.map(
        (g) => `${g.home}-${g.away}|${g.advancer ?? ""}`
      );
      expect(drawKeys).toEqual([
        "1-1|BRA",
        "0-0|BRA",
        "1-1|JPN",
      ]);
      expect(s.draw.scores[0]!.players).toEqual(["ana", "bob"]);
      expect(s.draw.scores[2]!.players).toEqual(["cat"]);
    });

    it("does not split home-win or away-win groups even when advancer is set", () => {
      // advancer should only appear on draws; decisive scorelines are unaffected
      const s = summarizeMatchPredictions([
        pAdv(2, 0, "a", null),
        pAdv(2, 0, "b", null),
        pAdv(0, 2, "c", null),
      ]);
      expect(s.homeWin.scores).toHaveLength(1);
      expect(s.awayWin.scores).toHaveLength(1);
      expect(s.homeWin.scores[0]!.advancer).toBeNull();
    });

    it("mode reflects the pure scoreline count, not the advancer-split count", () => {
      // "1-1" appears 3× total (BRA ×2, JPN ×1), "2-1" appears 2×.
      // Without advancer-aware mode fix, BRA ×2 would tie with "2-1" ×2.
      const s = summarizeMatchPredictions([
        pAdv(1, 1, "a", "BRA"),
        pAdv(1, 1, "b", "BRA"),
        pAdv(1, 1, "c", "JPN"),
        pAdv(2, 1, "d", null),
        pAdv(2, 1, "e", null),
      ]);
      // Pure "1-1" count = 3, "2-1" count = 2 → mode must be only "1-1"
      expect(s.mode).toEqual([{ home: 1, away: 1, count: 3 }]);
    });

    it("group-stage draws (no advancer) are unchanged — single group per scoreline", () => {
      const s = summarizeMatchPredictions([
        p(1, 1, "a"),
        p(1, 1, "b"),
        p(1, 1, "c"),
      ]);
      expect(s.draw.scores).toHaveLength(1);
      expect(s.draw.scores[0]!.count).toBe(3);
      expect(s.draw.scores[0]!.advancer).toBeNull();
    });
  });
});
