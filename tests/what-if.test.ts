import { describe, it, expect } from "vitest";
import {
  buildDefaultInputs,
  projectStandings,
  isMatchInputComplete,
  type WhatIfMatch,
  type WhatIfPredEntry,
  type MatchInput,
} from "../lib/scoring/what-if";
import type { LeaderboardRow, PodioPrediction } from "../lib/scoring/scoring";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRow(
  userId: string,
  rank: number,
  total: number,
  hit = 0,
  zero = 0
): LeaderboardRow {
  return {
    userId,
    displayName: userId,
    rank,
    totalPoints: total,
    matchesHit: hit,
    zeroMatches: zero,
    deltaFromLeader: 0,
  };
}

function groupMatch(id: string, status: "finished" | "scheduled" = "scheduled"): WhatIfMatch {
  return {
    id,
    roundId: "round-group",
    roundKey: "group_1",
    roundOrderIndex: 1,
    stage: "group",
    status,
    homeCode: "AAA",
    awayCode: "BBB",
    homeName: "Team A",
    awayName: "Team B",
    homeTeamId: "team-a",
    awayTeamId: "team-b",
    kickoffLabel: "Jun 14",
    actual: status === "finished" ? { home: 2, away: 1, advancingTeamId: null } : null,
  };
}

function knockoutMatch(
  id: string,
  homeTeamId = "team-home",
  awayTeamId = "team-away",
  status: "finished" | "scheduled" = "scheduled",
  actualHome?: number,
  actualAway?: number,
  advancingTeamId?: string | null
): WhatIfMatch {
  return {
    id,
    roundId: "round-knockout",
    roundKey: "knockout_r16",
    roundOrderIndex: 4,
    stage: "knockout",
    status,
    homeCode: "HOM",
    awayCode: "AWY",
    homeName: "Home",
    awayName: "Away",
    homeTeamId,
    awayTeamId,
    kickoffLabel: "Jul 4",
    actual:
      status === "finished" && actualHome !== undefined && actualAway !== undefined
        ? { home: actualHome, away: actualAway, advancingTeamId: advancingTeamId ?? null }
        : null,
  };
}

// ── buildDefaultInputs ────────────────────────────────────────────────────────

describe("buildDefaultInputs", () => {
  it("pre-fills finished matches with actual score", () => {
    const m: WhatIfMatch = {
      ...groupMatch("m1", "finished"),
      actual: { home: 2, away: 1, advancingTeamId: null },
    };
    const defaults = buildDefaultInputs([m]);
    expect(defaults["m1"]).toEqual({ home: 2, away: 1, advancingTeamId: "" });
  });

  it("starts upcoming matches blank", () => {
    const m = groupMatch("m2", "scheduled");
    const defaults = buildDefaultInputs([m]);
    expect(defaults["m2"]).toEqual({ home: "", away: "", advancingTeamId: "" });
  });

  it("carries advancingTeamId for finished knockout draw", () => {
    const m: WhatIfMatch = {
      ...knockoutMatch("m3", "team-home", "team-away", "finished", 1, 1, "team-home"),
      actual: { home: 1, away: 1, advancingTeamId: "team-home" },
    };
    const defaults = buildDefaultInputs([m]);
    expect(defaults["m3"]).toEqual({ home: 1, away: 1, advancingTeamId: "team-home" });
  });
});

// ── projectStandings — group stage ───────────────────────────────────────────

describe("projectStandings — group stage", () => {
  it("returns baseline unchanged when no scores entered", () => {
    const baseline = [makeRow("alice", 1, 100), makeRow("bob", 2, 80)];
    const match = groupMatch("m1");
    const { projected, anyChange } = projectStandings(
      baseline,
      [match],
      { m1: { home: "", away: "", advancingTeamId: "" } },
      {},
      {}
    );
    expect(anyChange).toBe(false);
    expect(projected[0]!.userId).toBe("alice");
    expect(projected[0]!.totalPoints).toBe(100);
  });

  it("awards group points to a player who predicted correctly", () => {
    // Alice predicted 2-1, Bob predicted 0-0. Actual (simulated): 2-1.
    const baseline = [makeRow("alice", 1, 100), makeRow("bob", 2, 90)];
    const match = groupMatch("m1");
    const inputs: Record<string, MatchInput> = { m1: { home: 2, away: 1, advancingTeamId: "" } };
    // Alice's prediction: 2-1 (exact match → 5+2+2+1 = 10 pts)
    // Bob's prediction: 0-0 (completely wrong → 0 pts)
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 2, away: 1, penaltyWinnerId: null },
      "bob:m1": { home: 0, away: 0, penaltyWinnerId: null },
    };

    const { projected, gainByUserId, anyChange } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    expect(anyChange).toBe(true);
    // Alice gains 10 pts (from 0 base)
    expect(gainByUserId.get("alice")).toBe(10);
    // Bob gains 0 pts
    expect(gainByUserId.get("bob")).toBe(0);
    // Alice projected: 110, Bob: 90 → Alice still #1
    expect(projected[0]!.userId).toBe("alice");
    expect(projected[0]!.totalPoints).toBe(110);
    expect(projected[1]!.userId).toBe("bob");
    expect(projected[1]!.totalPoints).toBe(90);
  });

  it("re-ranks players when gains change the order", () => {
    // Bob gains 10, Alice gains 0 → Bob overtakes Alice
    const baseline = [makeRow("alice", 1, 100), makeRow("bob", 2, 95)];
    const match = groupMatch("m1");
    const inputs: Record<string, MatchInput> = { m1: { home: 2, away: 1, advancingTeamId: "" } };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 0, away: 0, penaltyWinnerId: null }, // wrong
      "bob:m1": { home: 2, away: 1, penaltyWinnerId: null }, // exact → 10 pts
    };

    const { projected } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    expect(projected[0]!.userId).toBe("bob");
    expect(projected[0]!.totalPoints).toBe(105);
    expect(projected[1]!.userId).toBe("alice");
  });

  it("applies counterfactual delta for finished matches", () => {
    // Alice really scored 5 pts on match m1 (result correct but wrong goals).
    // Simulation changes it to 2-1; Alice predicted 2-1 exactly → would have scored 10.
    // Delta = 10 - 5 = +5.
    const baseline = [makeRow("alice", 1, 100)];
    const match: WhatIfMatch = {
      ...groupMatch("m1", "finished"),
      actual: { home: 2, away: 1, advancingTeamId: null }, // real result
    };
    const inputs: Record<string, MatchInput> = { m1: { home: 2, away: 1, advancingTeamId: "" } };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 2, away: 1, penaltyWinnerId: null },
    };
    const realPtsByKey = { "alice:m1": 5 }; // had correct result but wrong goals

    const { projected, gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      realPtsByKey
    );

    // Sim pts = 10 (exact), base pts = 5 → delta = +5
    expect(gainByUserId.get("alice")).toBe(5);
    expect(projected[0]!.totalPoints).toBe(105);
  });
});

// ── projectStandings — knockout stage ────────────────────────────────────────

describe("projectStandings — knockout stage", () => {
  it("awards advance bonus when predicted winner matches", () => {
    // Home wins 2-1 (simulated). Alice predicted 2-1 → home wins → advance ✓
    const baseline = [makeRow("alice", 1, 100)];
    const match = knockoutMatch("m1", "team-home", "team-away");
    const inputs: Record<string, MatchInput> = { m1: { home: 2, away: 1, advancingTeamId: "" } };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 2, away: 1, penaltyWinnerId: null }, // predicted home wins
    };

    const { projected, gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    // result(10) + homeGoals(4) + awayGoals(4) + diff(2) + advance(5) = 25
    expect(gainByUserId.get("alice")).toBe(25);
    expect(projected[0]!.totalPoints).toBe(125);
    expect(projected[0]!.matchesHit).toBe(1);
  });

  it("knockout draw: awards advance bonus when penaltyWinner matches", () => {
    // Simulated: 1-1 draw, home team advances (chosen in UI).
    // Alice predicted 0-0 draw, picked home team as penalty winner.
    const baseline = [makeRow("alice", 1, 100)];
    const match = knockoutMatch("m1", "team-home", "team-away");
    const inputs: Record<string, MatchInput> = {
      m1: { home: 1, away: 1, advancingTeamId: "team-home" },
    };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 0, away: 0, penaltyWinnerId: "team-home" },
    };

    const { projected, gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    // Alice predicted draw ✓ (result 10) + home goals miss (0) + away goals miss (0)
    // + diff 0===0 ✓ (2) + advance penalty_winner matches (5) = 17
    expect(gainByUserId.get("alice")).toBe(17);
  });

  it("knockout draw: no advance bonus when penalty winner wrong", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = knockoutMatch("m1", "team-home", "team-away");
    const inputs: Record<string, MatchInput> = {
      m1: { home: 1, away: 1, advancingTeamId: "team-home" }, // home advances
    };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 0, away: 0, penaltyWinnerId: "team-away" }, // picked away → wrong
    };

    const { gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    // result(10) + diff(2) + advance(0, wrong pen winner) = 12
    expect(gainByUserId.get("alice")).toBe(12);
  });

  it("blank knockout input is treated as no input (no change)", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = knockoutMatch("m1");
    const { anyChange } = projectStandings(
      baseline,
      [match],
      { m1: { home: "", away: "", advancingTeamId: "" } },
      {},
      {}
    );
    expect(anyChange).toBe(false);
  });
});

// ── anyChange flag ────────────────────────────────────────────────────────────

describe("anyChange flag", () => {
  it("is false when all gains are 0", () => {
    // All players predicted 0-0, simulated 0-0 → result correct (5 pts each), same pts
    // But since base is upcoming (0 pts) and now they get 5, anyChange should be true.
    // Let's test a case where the pred matches exactly and base was already correct.
    const baseline = [makeRow("alice", 1, 100)];
    const match: WhatIfMatch = {
      ...groupMatch("m1", "finished"),
      actual: { home: 1, away: 0, advancingTeamId: null },
    };
    const inputs: Record<string, MatchInput> = { m1: { home: 1, away: 0, advancingTeamId: "" } };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 1, away: 0, penaltyWinnerId: null }, // exact match → 10 pts
    };
    const realPtsByKey = { "alice:m1": 10 }; // already had 10 pts

    const { anyChange } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      realPtsByKey
    );

    // Sim pts = 10, base pts = 10 → delta = 0 → anyChange remains false
    expect(anyChange).toBe(false);
  });

  it("is true when any player's score changes", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = groupMatch("m1");
    const inputs: Record<string, MatchInput> = { m1: { home: 1, away: 0, advancingTeamId: "" } };
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 1, away: 0, penaltyWinnerId: null },
    };

    const { anyChange } = projectStandings(
      baseline,
      [match],
      inputs,
      predByKey,
      {}
    );

    expect(anyChange).toBe(true);
  });
});

// ── isMatchInputComplete ──────────────────────────────────────────────────────

describe("isMatchInputComplete", () => {
  it("returns true when both boxes are filled (string values)", () => {
    expect(isMatchInputComplete({ home: "2", away: "1", advancingTeamId: "" })).toBe(true);
  });

  it("returns true when both boxes are filled (numeric values from finished matches)", () => {
    expect(isMatchInputComplete({ home: 2, away: 1, advancingTeamId: "" })).toBe(true);
  });

  it("returns false when home is blank, away is filled", () => {
    expect(isMatchInputComplete({ home: "", away: "1", advancingTeamId: "" })).toBe(false);
  });

  it("returns false when away is blank, home is filled", () => {
    expect(isMatchInputComplete({ home: "2", away: "", advancingTeamId: "" })).toBe(false);
  });

  it("returns false when both boxes are blank", () => {
    expect(isMatchInputComplete({ home: "", away: "", advancingTeamId: "" })).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(isMatchInputComplete(undefined)).toBe(false);
  });
});

// ── projectStandings — half-filled inputs ─────────────────────────────────────

describe("projectStandings — half-filled inputs", () => {
  it("treats a half-filled match (home filled, away blank) as no input", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = groupMatch("m1");
    const predByKey: Record<string, WhatIfPredEntry> = {
      "alice:m1": { home: 2, away: 1, penaltyWinnerId: null },
    };

    const { anyChange, projected } = projectStandings(
      baseline,
      [match],
      { m1: { home: "2", away: "", advancingTeamId: "" } },  // half-filled
      predByKey,
      {}
    );

    // Half-filled: the match must be skipped entirely — no points, no rank change.
    expect(anyChange).toBe(false);
    expect(projected[0]!.totalPoints).toBe(100);
  });

  it("treats a half-filled match (away filled, home blank) as no input", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = groupMatch("m1");

    const { anyChange } = projectStandings(
      baseline,
      [match],
      { m1: { home: "", away: "1", advancingTeamId: "" } },  // half-filled
      {},
      {}
    );

    expect(anyChange).toBe(false);
  });
});

// ── projectStandings — podium bonus ──────────────────────────────────────────

function finalMatch(
  homeTeamId = "champ-team",
  awayTeamId = "runner-team"
): WhatIfMatch {
  return {
    id: "final",
    roundId: "round-final",
    roundKey: "knockout_final",
    roundOrderIndex: 10,
    stage: "knockout",
    status: "scheduled",
    homeCode: "HOM",
    awayCode: "AWY",
    homeName: "Home",
    awayName: "Away",
    homeTeamId,
    awayTeamId,
    kickoffLabel: "Jul 19",
    actual: null,
  };
}

function thirdPlaceMatch(
  homeTeamId = "third-team",
  awayTeamId = "fourth-team"
): WhatIfMatch {
  return {
    id: "third",
    roundId: "round-third",
    roundKey: "knockout_3rd",
    roundOrderIndex: 9,
    stage: "knockout",
    status: "scheduled",
    homeCode: "TRD",
    awayCode: "FTH",
    homeName: "Third",
    awayName: "Fourth",
    homeTeamId,
    awayTeamId,
    kickoffLabel: "Jul 18",
    actual: null,
  };
}

describe("projectStandings — podium bonus", () => {
  it("awards champion + runner-up when the Final is simulated", () => {
    // Alice predicted champ-team champion, runner-team runner-up (exact) → +75.
    // Bob predicted the reverse → 0.
    const baseline = [makeRow("alice", 1, 100), makeRow("bob", 2, 100)];
    const match = finalMatch("champ-team", "runner-team");
    const inputs: Record<string, MatchInput> = {
      final: { home: 2, away: 0, advancingTeamId: "" },
    };
    const podioPredByUser: Record<string, PodioPrediction> = {
      alice: {
        champion_team_id: "champ-team",
        runner_up_team_id: "runner-team",
        third_place_team_id: null,
      },
      bob: {
        champion_team_id: "runner-team",
        runner_up_team_id: "champ-team",
        third_place_team_id: null,
      },
    };

    const { gainByUserId, anyChange } = projectStandings(
      baseline,
      [match],
      inputs,
      {},
      {},
      podioPredByUser,
      {}
    );

    expect(anyChange).toBe(true);
    expect(gainByUserId.get("alice")).toBe(75); // 50 champion + 25 runner-up
    expect(gainByUserId.get("bob")).toBe(0);
  });

  it("awards third place independently when only the 3rd-place match is simulated", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = thirdPlaceMatch("third-team", "fourth-team");
    const inputs: Record<string, MatchInput> = {
      third: { home: 1, away: 0, advancingTeamId: "" },
    };
    const podioPredByUser: Record<string, PodioPrediction> = {
      alice: {
        champion_team_id: null,
        runner_up_team_id: null,
        third_place_team_id: "third-team",
      },
    };

    const { gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      {},
      {},
      podioPredByUser,
      {}
    );

    expect(gainByUserId.get("alice")).toBe(15);
  });

  it("nets zero when re-simulating the already-scored real podium (no double count)", () => {
    // Alice's podio bonus was already scored (75 pts) and folded into her
    // baseline total by the caller. Re-entering the same real Final result
    // should produce a podium delta of 0.
    const baseline = [makeRow("alice", 1, 175)]; // 100 match pts + 75 podio pts
    const match = finalMatch("champ-team", "runner-team");
    const inputs: Record<string, MatchInput> = {
      final: { home: 2, away: 0, advancingTeamId: "" },
    };
    const podioPredByUser: Record<string, PodioPrediction> = {
      alice: {
        champion_team_id: "champ-team",
        runner_up_team_id: "runner-team",
        third_place_team_id: null,
      },
    };
    const realPodioPtsByUser = { alice: 75 };

    const { gainByUserId, projected } = projectStandings(
      baseline,
      [match],
      inputs,
      {},
      {},
      podioPredByUser,
      realPodioPtsByUser
    );

    expect(gainByUserId.get("alice")).toBe(0);
    expect(projected[0]!.totalPoints).toBe(175);
  });

  it("does not award champion/runner-up on an unresolved draw (no advancing team chosen)", () => {
    const baseline = [makeRow("alice", 1, 100)];
    const match = finalMatch("champ-team", "runner-team");
    // Draw entered but no penalty winner selected yet → incomplete for podium.
    const inputs: Record<string, MatchInput> = {
      final: { home: 1, away: 1, advancingTeamId: "" },
    };
    const podioPredByUser: Record<string, PodioPrediction> = {
      alice: {
        champion_team_id: "champ-team",
        runner_up_team_id: "runner-team",
        third_place_team_id: null,
      },
    };

    const { gainByUserId } = projectStandings(
      baseline,
      [match],
      inputs,
      {},
      {},
      podioPredByUser,
      {}
    );

    // No prediction supplied for the match itself (predByKey is empty) and no
    // champion/runner-up could be determined from the unresolved draw, so the
    // total gain should be exactly 0.
    expect(gainByUserId.get("alice")).toBe(0);
  });
});
