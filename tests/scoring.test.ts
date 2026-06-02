import { describe, it, expect } from "vitest";
import {
  scorePrediction,
  scorePodio,
  computeLeaderboard,
} from "../lib/scoring/scoring";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pred(
  home: number,
  away: number,
  penWinner?: string | null
) {
  return { home_score_pred: home, away_score_pred: away, penalty_winner_team_id: penWinner };
}

function actual(
  home: number | null,
  away: number | null,
  penWinner?: string | null,
  advancing?: string | null,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
) {
  return {
    home_score: home,
    away_score: away,
    penalty_winner_team_id: penWinner ?? null,
    advancing_team_id: advancing ?? null,
    home_team_id: homeTeamId ?? null,
    away_team_id: awayTeamId ?? null,
  };
}

// ── Group Stage — Spec worked examples (§4.4) ─────────────────────────────────

describe("scorePrediction — group stage spec examples", () => {
  it("2-1 vs 2-1 → 10 (perfect)", () => {
    const r = scorePrediction(pred(2, 1), actual(2, 1), "group");
    expect(r.total).toBe(10);
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(2);
    expect(r.awayGoals).toBe(2);
    expect(r.diffAndWinner).toBe(1);
    expect(r.advance).toBe(0);
  });

  it("2-0 vs 3-1 → 6 (correct winner + diff)", () => {
    const r = scorePrediction(pred(2, 0), actual(3, 1), "group");
    expect(r.total).toBe(6);
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(0);
    expect(r.diffAndWinner).toBe(1);
  });

  it("1-1 vs 2-2 → 6 (draw + diff=0 per spec note)", () => {
    // The worked-example table shows 5, but the explicit interpretation note states
    // "predicting any draw when the match is a draw earns 5 + 1 = 6 pts minimum."
    const r = scorePrediction(pred(1, 1), actual(2, 2), "group");
    expect(r.total).toBe(6);
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(0);
    expect(r.diffAndWinner).toBe(1);
  });

  it("2-1 vs 1-2 → 0 (wrong winner)", () => {
    const r = scorePrediction(pred(2, 1), actual(1, 2), "group");
    expect(r.total).toBe(0);
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(0);
    expect(r.diffAndWinner).toBe(0);
  });

  it("0-0 vs 0-0 → 10 (perfect draw)", () => {
    const r = scorePrediction(pred(0, 0), actual(0, 0), "group");
    expect(r.total).toBe(10);
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(2);
    expect(r.awayGoals).toBe(2);
    expect(r.diffAndWinner).toBe(1);
  });

  it("3-1 vs 2-1 → 7 (correct winner + correct away goal)", () => {
    const r = scorePrediction(pred(3, 1), actual(2, 1), "group");
    expect(r.total).toBe(7);
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(2);
    expect(r.diffAndWinner).toBe(0);
  });
});

// ── Group Stage — Additional edge cases ───────────────────────────────────────

describe("scorePrediction — group stage edge cases", () => {
  it("returns 0 when prediction is null", () => {
    expect(scorePrediction(null, actual(1, 0), "group").total).toBe(0);
  });

  it("returns 0 when prediction is undefined", () => {
    expect(scorePrediction(undefined, actual(1, 0), "group").total).toBe(0);
  });

  it("returns 0 when actual has null home_score", () => {
    expect(scorePrediction(pred(1, 0), actual(null, 0), "group").total).toBe(0);
  });

  it("returns 0 when actual has null away_score", () => {
    expect(scorePrediction(pred(1, 0), actual(1, null), "group").total).toBe(0);
  });

  it("returns 0 when actual is null", () => {
    expect(scorePrediction(pred(1, 0), null, "group").total).toBe(0);
  });

  it("returns 0 when actual is undefined", () => {
    expect(scorePrediction(pred(1, 0), undefined, "group").total).toBe(0);
  });

  it("correct away winner — away goals exact", () => {
    // pred: 0-2, actual: 1-3 → away wins both, away goals ✗ (2≠3), home ✗ (0≠1), diff: -2 vs -2 ✓
    const r = scorePrediction(pred(0, 2), actual(1, 3), "group");
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(0);
    expect(r.diffAndWinner).toBe(1);
    expect(r.total).toBe(6);
  });

  it("draw predicted, home wins actual → away goal still scores independently", () => {
    // pred 1-1 (draw), actual 2-1 (home wins): result ✗, home ✗, away ✓(2), diff ✗ → 2
    const r = scorePrediction(pred(1, 1), actual(2, 1), "group");
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(2);
    expect(r.diffAndWinner).toBe(0);
    expect(r.total).toBe(2);
  });

  it("wrong winner, no goals match → 0", () => {
    // pred 0-2 (away wins), actual 2-1 (home wins): nothing matches
    const r = scorePrediction(pred(0, 2), actual(2, 1), "group");
    expect(r.total).toBe(0);
  });

  it("correct result but diff differs → no diffAndWinner bonus", () => {
    // pred 2-0 (diff+2), actual 1-0 (diff+1) — same winner, different diff
    const r = scorePrediction(pred(2, 0), actual(1, 0), "group");
    expect(r.result).toBe(5);
    expect(r.diffAndWinner).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(2);
    expect(r.total).toBe(7);
  });

  it("correct winner but goals and diff wrong → result points only", () => {
    // pred 3-0 (home, diff+3), actual 1-0 (home, diff+1) → same winner, diff differs
    const r = scorePrediction(pred(3, 0), actual(1, 0), "group");
    expect(r.result).toBe(5);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(2); // both away=0
    expect(r.diffAndWinner).toBe(0); // diff 3 vs 1 — no match
    expect(r.total).toBe(7);
  });

  it("advance is always 0 for group stage", () => {
    const r = scorePrediction(pred(2, 1), actual(2, 1), "group");
    expect(r.advance).toBe(0);
  });
});

// ── Knockout Stage — Spec worked examples (§4.4) ─────────────────────────────

describe("scorePrediction — knockout stage spec examples", () => {
  const HOME_ID = "home-team-uuid";
  const AWAY_ID = "away-team-uuid";

  it("2-1 home vs 2-1 home → 25 (perfect clear winner)", () => {
    const r = scorePrediction(
      pred(2, 1),
      actual(2, 1, null, HOME_ID),
      "knockout"
    );
    expect(r.total).toBe(25);
    expect(r.result).toBe(10);
    expect(r.homeGoals).toBe(4);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(2);
    expect(r.advance).toBe(5);
  });

  it("1-1 + home pens pred vs 1-1 + home pens actual → 25 (perfect draw)", () => {
    const r = scorePrediction(
      pred(1, 1, HOME_ID),
      actual(1, 1, HOME_ID, HOME_ID),
      "knockout"
    );
    expect(r.total).toBe(25);
    expect(r.result).toBe(10);
    expect(r.homeGoals).toBe(4);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(2);
    expect(r.advance).toBe(5);
  });

  it("1-1 + home pens pred vs 1-1 + away pens actual → 20 (wrong advance)", () => {
    const r = scorePrediction(
      pred(1, 1, HOME_ID),
      actual(1, 1, AWAY_ID, AWAY_ID),
      "knockout"
    );
    expect(r.total).toBe(20);
    expect(r.result).toBe(10);
    expect(r.homeGoals).toBe(4);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(2);
    expect(r.advance).toBe(0);
  });

  it("2-1 home pred vs 1-1 + away pens actual → 4 (away goal matches, advance wrong)", () => {
    // result ✗ (home win vs draw), home ✗ (2≠1), away ✓ (1=1), diff ✗
    // advance ✗: predicted home (HOME_ID), actual advancer is AWAY_ID → mismatch
    const r = scorePrediction(
      pred(2, 1),
      actual(1, 1, AWAY_ID, AWAY_ID, HOME_ID, AWAY_ID),
      "knockout"
    );
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(0);
    expect(r.advance).toBe(0);
    expect(r.total).toBe(4);
  });

  it("2-1 home pred vs 1-1 + home pens actual → 9 (wrong result, away matches, advance correct)", () => {
    // result ✗ (home win vs draw), home ✗ (2≠1), away ✓ (1=1), diff ✗
    // advance ✓: predicted home (HOME_ID), actual advancer is HOME_ID → match
    const r = scorePrediction(
      pred(2, 1),
      actual(1, 1, HOME_ID, HOME_ID, HOME_ID, AWAY_ID),
      "knockout"
    );
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(0);
    expect(r.advance).toBe(5);
    expect(r.total).toBe(9);
  });
});

// ── Knockout Stage — Additional edge cases ────────────────────────────────────

describe("scorePrediction — knockout stage edge cases", () => {
  const HOME_ID = "home-team-uuid";
  const AWAY_ID = "away-team-uuid";

  it("returns 0 when prediction is null", () => {
    expect(scorePrediction(null, actual(1, 0), "knockout").total).toBe(0);
  });

  it("returns 0 when actual is null", () => {
    expect(scorePrediction(pred(1, 0), null, "knockout").total).toBe(0);
  });

  it("returns 0 when actual scores are null (unfinished match)", () => {
    expect(scorePrediction(pred(1, 0), actual(null, null), "knockout").total).toBe(0);
  });

  it("correct away winner, exact scores → 25", () => {
    const r = scorePrediction(
      pred(0, 2),
      actual(0, 2, null, AWAY_ID),
      "knockout"
    );
    expect(r.total).toBe(25);
  });

  it("correct winner, wrong goals → partial score", () => {
    // pred 3-0 (home), actual 1-0 (home) — different goals, same diff? No: pred diff=3, actual diff=1
    const r = scorePrediction(
      pred(3, 0),
      actual(1, 0, null, HOME_ID),
      "knockout"
    );
    expect(r.result).toBe(10);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(4); // both 0
    expect(r.diffAndWinner).toBe(0); // diff 3 vs 1
    expect(r.advance).toBe(5); // non-draw, correct result
    expect(r.total).toBe(19);
  });

  it("draw pred with missing penalty_winner → advance = 0", () => {
    // User predicted draw but didn't set penalty winner (e.g. null)
    const r = scorePrediction(
      pred(1, 1, null),
      actual(1, 1, HOME_ID, HOME_ID),
      "knockout"
    );
    expect(r.result).toBe(10);
    expect(r.advance).toBe(0);
    expect(r.total).toBe(20); // 10+4+4+2+0
  });

  it("predicted home winner vs actual away winner → 0 (wrong result)", () => {
    const r = scorePrediction(
      pred(2, 0),
      actual(0, 1, null, AWAY_ID),
      "knockout"
    );
    expect(r.total).toBe(0);
  });

  it("predicted away winner vs actual draw → 0 (wrong result)", () => {
    const r = scorePrediction(
      pred(0, 2),
      actual(1, 1, HOME_ID, HOME_ID),
      "knockout"
    );
    expect(r.total).toBe(0);
  });

  it("draw pred, wrong FT result, correct advancer → away goals + advance (9 pts)", () => {
    // pred 1-1 + home pens, actual 2-1 home (home wins in regulation)
    // result ✗ (draw vs home win), home ✗ (1≠2), away ✓ (1=1), diff ✗, advance ✓ (home pen = home advancer)
    const r = scorePrediction(
      pred(1, 1, HOME_ID),
      actual(2, 1, null, HOME_ID),
      "knockout"
    );
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(0);
    expect(r.awayGoals).toBe(4);
    expect(r.diffAndWinner).toBe(0);
    expect(r.advance).toBe(5);
    expect(r.total).toBe(9);
  });

  it("draw pred, wrong FT result, wrong advancer → only away goals (4 pts)", () => {
    // pred 1-1 + home pens, actual 2-1 away (away wins in regulation)
    // result ✗, home ✗ (1≠0... wait let's use 0-2), away ✓ (1=... no)
    // pred 1-1 + home pens, actual 0-1 away → away ✗ (1≠1? no 1=1!) hmm
    // pred 1-1 + home pens, actual 2-1 away (away wins) → home ✗ (1≠2? no, home=1 pred vs home=2 actual ✗), away ✓ (1=1)
    // Wait actual(2,1) means home=2, away=1. Let's do actual(0,2) away wins.
    // pred 1-1 home_pen, actual 0-2 away wins → home ✗(1≠0), away ✗(1≠2), advance: home_pen ≠ away_advancing → ✗
    // Better: pred 1-1 home_pen, actual 1-2 away → home ✓(1=1), away ✗(1≠2), advance ✗ → 4 pts
    const r = scorePrediction(
      pred(1, 1, HOME_ID),
      actual(1, 2, null, AWAY_ID),
      "knockout"
    );
    expect(r.result).toBe(0);
    expect(r.homeGoals).toBe(4); // 1=1
    expect(r.awayGoals).toBe(0); // 1≠2
    expect(r.diffAndWinner).toBe(0);
    expect(r.advance).toBe(0); // home_pen ≠ away advancing
    expect(r.total).toBe(4);
  });

  it("uses advancing_team_id preferentially over penalty_winner_team_id", () => {
    // advancing_team_id and penalty_winner_team_id differ — advancing_team_id wins
    const r = scorePrediction(
      pred(1, 1, HOME_ID),
      { home_score: 1, away_score: 1, penalty_winner_team_id: AWAY_ID, advancing_team_id: HOME_ID },
      "knockout"
    );
    expect(r.advance).toBe(5); // advancing_team_id = HOME_ID matches prediction
  });

  it("0-0 draw predicted vs 0-0 draw with pens → diff+winner awarded", () => {
    const r = scorePrediction(
      pred(0, 0, HOME_ID),
      actual(0, 0, HOME_ID, HOME_ID),
      "knockout"
    );
    expect(r.diffAndWinner).toBe(2);
    expect(r.total).toBe(25);
  });
});

// ── scorePodio ─────────────────────────────────────────────────────────────────

describe("scorePodio", () => {
  const ARG = "arg-uuid";
  const FRA = "fra-uuid";
  const MAR = "mar-uuid";
  const ESP = "esp-uuid";

  const actual_ = {
    champion_team_id: ARG,
    runner_up_team_id: FRA,
    third_place_team_id: MAR,
  };

  it("all correct → 90", () => {
    expect(
      scorePodio(
        { champion_team_id: ARG, runner_up_team_id: FRA, third_place_team_id: MAR },
        actual_
      )
    ).toBe(90);
  });

  it("only champion correct → 50", () => {
    expect(
      scorePodio(
        { champion_team_id: ARG, runner_up_team_id: ESP, third_place_team_id: ESP },
        actual_
      )
    ).toBe(50);
  });

  it("only runner-up correct → 25", () => {
    expect(
      scorePodio(
        { champion_team_id: FRA, runner_up_team_id: FRA, third_place_team_id: ESP },
        actual_
      )
    ).toBe(25);
  });

  it("only third place correct → 15", () => {
    expect(
      scorePodio(
        { champion_team_id: FRA, runner_up_team_id: ESP, third_place_team_id: MAR },
        actual_
      )
    ).toBe(15);
  });

  it("champion + runner-up correct → 75", () => {
    expect(
      scorePodio(
        { champion_team_id: ARG, runner_up_team_id: FRA, third_place_team_id: ESP },
        actual_
      )
    ).toBe(75);
  });

  it("nothing correct → 0", () => {
    expect(
      scorePodio(
        { champion_team_id: ESP, runner_up_team_id: MAR, third_place_team_id: FRA },
        actual_
      )
    ).toBe(0);
  });

  it("null prediction → 0", () => {
    expect(scorePodio(null, actual_)).toBe(0);
  });

  it("undefined prediction → 0", () => {
    expect(scorePodio(undefined, actual_)).toBe(0);
  });

  it("null actual → 0", () => {
    expect(
      scorePodio(
        { champion_team_id: ARG, runner_up_team_id: FRA, third_place_team_id: MAR },
        null
      )
    ).toBe(0);
  });

  it("null champion_team_id in prediction → 0 for that slot", () => {
    expect(
      scorePodio(
        { champion_team_id: null, runner_up_team_id: FRA, third_place_team_id: MAR },
        actual_
      )
    ).toBe(40); // only runner-up (25) + third (15)
  });
});

// ── computeLeaderboard ────────────────────────────────────────────────────────

describe("computeLeaderboard", () => {
  const alice = { id: "alice", displayName: "Alice" };
  const bob = { id: "bob", displayName: "Bob" };
  const carol = { id: "carol", displayName: "Carol" };
  const users = [alice, bob, carol];

  const M1 = "match-1";
  const M2 = "match-2";
  const M3 = "match-3";
  const grp = (id: string) => ({ id, stage: "group" as const });
  const ko = (id: string) => ({ id, stage: "knockout" as const });
  const finishedGroup = [grp(M1), grp(M2), grp(M3)];

  it("ranks by total points descending", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 },
      { userId: "alice", matchId: M2, pointsAwarded: 6 },
      { userId: "bob", matchId: M1, pointsAwarded: 7 },
      { userId: "bob", matchId: M2, pointsAwarded: 7 },
      { userId: "carol", matchId: M1, pointsAwarded: 5 },
    ];
    const rows = computeLeaderboard(users, finishedGroup, predictions);
    expect(rows[0]!.userId).toBe("alice"); // 16 pts
    expect(rows[1]!.userId).toBe("bob");   // 14 pts
    expect(rows[2]!.userId).toBe("carol"); // 5 pts
    expect(rows[0]!.totalPoints).toBe(16);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
    expect(rows[2]!.rank).toBe(3);
  });

  it("unsubmitted predictions count as zero-matches", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 5 },
    ];
    const rows = computeLeaderboard([alice, carol], finishedGroup, predictions);
    const carolRow = rows.find((r) => r.userId === "carol")!;
    expect(carolRow.zeroMatches).toBe(3);
    expect(carolRow.matchesHit).toBe(0);
  });

  it("acierto = perfect group match (10/10); partial group score is neither hit nor zero", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 }, // perfect → hit
      { userId: "alice", matchId: M2, pointsAwarded: 5 },  // partial → neither
      { userId: "alice", matchId: M3, pointsAwarded: 0 },  // zero
    ];
    const rows = computeLeaderboard([alice], finishedGroup, predictions);
    expect(rows[0]!.matchesHit).toBe(1);
    expect(rows[0]!.zeroMatches).toBe(1);
    expect(rows[0]!.totalPoints).toBe(15);
  });

  it("acierto = perfect knockout match (25/25); partial knockout score is neither hit nor zero", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 25 }, // perfect → hit
      { userId: "alice", matchId: M2, pointsAwarded: 19 }, // partial → neither
      { userId: "alice", matchId: M3, pointsAwarded: 0 },  // zero
    ];
    const finishedKO = [ko(M1), ko(M2), ko(M3)];
    const rows = computeLeaderboard([alice], finishedKO, predictions);
    expect(rows[0]!.matchesHit).toBe(1);
    expect(rows[0]!.zeroMatches).toBe(1);
    expect(rows[0]!.totalPoints).toBe(44);
  });

  it("group 10 is a hit; knockout 10 is NOT a hit (max in knockout is 25)", () => {
    const finishedMix = [grp(M1), ko(M2)];
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 }, // perfect group → hit
      { userId: "alice", matchId: M2, pointsAwarded: 10 }, // partial knockout → neither
    ];
    const rows = computeLeaderboard([alice], finishedMix, predictions);
    expect(rows[0]!.matchesHit).toBe(1);
    expect(rows[0]!.zeroMatches).toBe(0);
    expect(rows[0]!.totalPoints).toBe(20);
  });

  it("tiebreaker 1 — more aciertos (perfect matches) wins", () => {
    // Both at 10 pts: Alice has 1 perfect group; Bob has 2 partial group matches.
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 },
      { userId: "bob",   matchId: M1, pointsAwarded: 5 },
      { userId: "bob",   matchId: M2, pointsAwarded: 5 },
    ];
    const rows = computeLeaderboard(
      [alice, bob],
      [grp(M1), grp(M2)],
      predictions
    );
    expect(rows[0]!.userId).toBe("alice"); // 10 pts, 1 hit
    expect(rows[1]!.userId).toBe("bob");   // 10 pts, 0 hits
  });

  it("tiebreaker 2 — fewer zero-matches wins when total + aciertos are equal", () => {
    // Both 18 pts, 1 hit. Alice: 0 zeros (2 partials). Bob: 1 zero (1 partial).
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 },
      { userId: "alice", matchId: M2, pointsAwarded: 4 },
      { userId: "alice", matchId: M3, pointsAwarded: 4 },
      { userId: "bob",   matchId: M1, pointsAwarded: 10 },
      { userId: "bob",   matchId: M2, pointsAwarded: 8 },
      { userId: "bob",   matchId: M3, pointsAwarded: 0 },
    ];
    const rows = computeLeaderboard([alice, bob], finishedGroup, predictions);
    expect(rows[0]!.userId).toBe("alice"); // 0 zeros
    expect(rows[1]!.userId).toBe("bob");   // 1 zero
  });

  it("tied on all tiebreakers → shared rank", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 5 },
      { userId: "bob", matchId: M1, pointsAwarded: 5 },
    ];
    const rows = computeLeaderboard([alice, bob], [grp(M1)], predictions);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
  });

  it("deltaFromLeader is 0 for leader and negative for others", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: 10 },
      { userId: "bob", matchId: M1, pointsAwarded: 6 },
    ];
    const rows = computeLeaderboard([alice, bob], [grp(M1)], predictions);
    expect(rows[0]!.deltaFromLeader).toBe(0);
    expect(rows[1]!.deltaFromLeader).toBe(-4);
  });

  it("empty users returns empty array", () => {
    expect(computeLeaderboard([], [grp(M1)], [])).toEqual([]);
  });

  it("no finished matches → everyone at 0 pts", () => {
    const rows = computeLeaderboard([alice, bob], [], []);
    expect(rows[0]!.totalPoints).toBe(0);
    expect(rows[1]!.totalPoints).toBe(0);
  });

  it("pointsAwarded null treated as 0", () => {
    const predictions = [
      { userId: "alice", matchId: M1, pointsAwarded: null },
    ];
    const rows = computeLeaderboard([alice], [grp(M1)], predictions);
    expect(rows[0]!.totalPoints).toBe(0);
    expect(rows[0]!.zeroMatches).toBe(1);
  });
});
