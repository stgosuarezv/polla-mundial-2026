import { describe, it, expect } from "vitest";
import {
  computeCalzometro,
  type CalzometroMatch,
  type CalzometroPred,
} from "../lib/scoring/calzometro";

const names = new Map([
  ["u1", "Ana"],
  ["u2", "Beto"],
  ["u3", "Cami"],
]);

function match(
  id: string,
  over: Partial<CalzometroMatch> = {}
): CalzometroMatch {
  return {
    id,
    label: `M-${id}`,
    kickoffAt: `2026-06-0${id.length}T15:00:00Z`,
    stage: "group",
    homeTeamId: "th",
    awayTeamId: "ta",
    homeCode: "AAA",
    awayCode: "BBB",
    roundNameKey: "rounds.group_3",
    roundOrderIndex: 2,
    ...over,
  };
}

function pred(
  userId: string,
  matchId: string,
  home: number,
  away: number,
  penaltyWinnerId: string | null = null
): CalzometroPred {
  return { userId, matchId, home, away, penaltyWinnerId };
}

describe("computeCalzometro", () => {
  it("picks the latest locked round and counts identical picks", () => {
    const matches = [
      match("a", { roundOrderIndex: 0, roundNameKey: "rounds.group_1" }),
      match("m1"),
      match("m2"),
      match("m3"),
    ];
    const preds = [
      // old-round pick must be ignored
      pred("u1", "a", 9, 9),
      // u1 & u2 agree on 2/3; u3 agrees with nobody
      pred("u1", "m1", 2, 1),
      pred("u2", "m1", 2, 1),
      pred("u3", "m1", 0, 0),
      pred("u1", "m2", 1, 1),
      pred("u2", "m2", 1, 1),
      pred("u3", "m2", 3, 0),
      pred("u1", "m3", 0, 2),
      pred("u2", "m3", 1, 2),
      pred("u3", "m3", 2, 2),
    ];

    const r = computeCalzometro(matches, preds, names)!;
    expect(r.roundNameKey).toBe("rounds.group_3");
    expect(r.matchCount).toBe(3);
    expect(r.topPairs).toHaveLength(1);
    expect(r.morePairCount).toBe(0);
    const p = r.topPairs[0]!;
    expect([p.userAName, p.userBName]).toEqual(["Ana", "Beto"]);
    expect(p.equalCount).toBe(2);
    expect(p.bothCount).toBe(3);
    expect(p.rows.map((row) => row.equal)).toEqual([true, true, false]);
  });

  it("counts only matches where both submitted (denominator)", () => {
    const matches = [match("m1"), match("m2"), match("m3")];
    const preds = [
      pred("u1", "m1", 1, 0),
      pred("u2", "m1", 1, 0),
      pred("u1", "m2", 2, 0),
      pred("u2", "m2", 2, 0),
      pred("u1", "m3", 3, 0), // u2 skipped m3
    ];
    const p = computeCalzometro(matches, preds, names)!.topPairs[0]!;
    expect(p.bothCount).toBe(2);
    expect(p.equalCount).toBe(2);
    const m3row = p.rows[2]!;
    expect(m3row.pickB).toBeNull();
    expect(m3row.equal).toBe(false);
  });

  it("knockout draws only match when the penalty winner matches too", () => {
    const matches = [
      match("m1", { stage: "knockout" }),
      match("m2", { stage: "knockout" }),
    ];
    // m1: same 1-1 but different winners → NOT equal.
    // m2: non-draw pick ignores winner field → equal.
    const preds = [
      pred("u1", "m1", 1, 1, "th"),
      pred("u2", "m1", 1, 1, "ta"),
      pred("u1", "m2", 2, 0, "th"),
      pred("u2", "m2", 2, 0, null),
    ];
    const p = computeCalzometro(matches, preds, names)!.topPairs[0]!;
    expect(p.equalCount).toBe(1);
    expect(p.rows[0]!.equal).toBe(false);
    expect(p.rows[0]!.pickA).toBe("1–1 (AAA)");
    expect(p.rows[1]!.equal).toBe(true);
  });

  it("shows every eligible pair, ranked", () => {
    const matches = [match("m1"), match("m2")];
    const preds = [
      pred("u1", "m1", 1, 0),
      pred("u2", "m1", 1, 0),
      pred("u3", "m1", 1, 0),
      pred("u1", "m2", 0, 0),
      pred("u2", "m2", 0, 0),
      pred("u3", "m2", 0, 0),
    ];
    // all three pairs are 2/2
    const r = computeCalzometro(matches, preds, names)!;
    expect(r.topPairs).toHaveLength(3);
    expect(r.morePairCount).toBe(0);
  });

  it("caps the list at 5 pairs and reports the overflow", () => {
    const manyNames = new Map([...names, ["u4", "Dani"]]);
    const matches = [match("m1"), match("m2")];
    // 4 users all identical on both matches → C(4,2) = 6 eligible pairs
    const preds = ["u1", "u2", "u3", "u4"].flatMap((u) => [
      pred(u, "m1", 1, 0),
      pred(u, "m2", 2, 2),
    ]);
    const r = computeCalzometro(matches, preds, manyNames)!;
    expect(r.topPairs).toHaveLength(5);
    expect(r.morePairCount).toBe(1);
  });

  it("prefers the tighter calzón on equal hits (3/3 over 3/4)", () => {
    const matches = [match("m1"), match("m2"), match("m3"), match("m4")];
    const preds = [
      // u1-u2: 3 equal of 4 shared (differs on m3, matches m1/m2/m4)
      pred("u1", "m1", 1, 0),
      pred("u2", "m1", 1, 0),
      pred("u1", "m2", 2, 0),
      pred("u2", "m2", 2, 0),
      pred("u1", "m3", 3, 0),
      pred("u2", "m3", 9, 9),
      pred("u1", "m4", 4, 0),
      pred("u2", "m4", 4, 0),
      // u1-u3: 3 equal of 3 shared (perfect)
      pred("u3", "m1", 1, 0),
      pred("u3", "m2", 2, 0),
      pred("u3", "m3", 3, 0),
    ];
    const r = computeCalzometro(matches, preds, names)!;
    expect(r.topPairs[0]!.bothCount).toBe(3);
    expect(r.topPairs[0]!.equalCount).toBe(3);
  });

  it("drops pairs agreeing on under half their picks (per-pair floor)", () => {
    const matches = [match("m1"), match("m2"), match("m3")];
    const preds = [
      pred("u1", "m1", 1, 0),
      pred("u2", "m1", 1, 0),
      pred("u1", "m2", 2, 0),
      pred("u2", "m2", 5, 5),
      pred("u1", "m3", 3, 0),
      pred("u2", "m3", 6, 6),
    ];
    // only pair is 1/3 → below the floor → section hidden
    expect(computeCalzometro(matches, preds, names)).toBeNull();
  });

  it("a below-floor pair with more hits cannot hide a perfect pair", () => {
    const ms = Array.from({ length: 8 }, (_, i) => match(`m${i + 1}`));
    const preds = [
      // u1-u2: 3 equal of 8 shared (37.5%, below floor) — more absolute hits
      ...ms.map((m, i) => pred("u1", m.id, i < 3 ? 1 : 7, 0)),
      ...ms.map((m, i) => pred("u2", m.id, i < 3 ? 1 : 8, 0)),
      // u1-u3: 2 equal of 2 shared (perfect); u2-u3: 0 equal → ineligible
      pred("u3", "m4", 7, 0),
      pred("u3", "m5", 7, 0),
    ];
    const r = computeCalzometro(ms, preds, names)!;
    expect(r.topPairs[0]!.equalCount).toBe(2);
    expect(r.topPairs[0]!.bothCount).toBe(2);
    expect(r.topPairs).toHaveLength(1);
  });

  it("hides for <2 participants, 1-match rounds, and empty input", () => {
    expect(computeCalzometro([], [], names)).toBeNull();
    expect(
      computeCalzometro([match("m1")], [pred("u1", "m1", 1, 0)], names)
    ).toBeNull();
    // 1-match round: bothCount >= 2 unattainable
    expect(
      computeCalzometro(
        [match("m1")],
        [pred("u1", "m1", 1, 0), pred("u2", "m1", 1, 0)],
        names
      )
    ).toBeNull();
  });
});
