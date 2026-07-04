import { describe, it, expect } from "vitest";
import { actualAdvancerId, drawAdvancerCode } from "../lib/scoring/advancer";

const home = { id: "th", code: "ARG" };
const away = { id: "ta", code: "BRA" };

function opts(over: Partial<Parameters<typeof drawAdvancerCode>[0]> = {}) {
  return {
    isKnockout: true,
    homeScore: 1,
    awayScore: 1,
    advancerId: "th",
    home,
    away,
    ...over,
  };
}

describe("actualAdvancerId", () => {
  it("prefers advancing_team_id over penalty_winner_team_id", () => {
    expect(
      actualAdvancerId({ advancing_team_id: "a", penalty_winner_team_id: "b" })
    ).toBe("a");
    expect(
      actualAdvancerId({
        advancing_team_id: null,
        penalty_winner_team_id: "b",
      })
    ).toBe("b");
    expect(
      actualAdvancerId({
        advancing_team_id: null,
        penalty_winner_team_id: null,
      })
    ).toBeNull();
  });
});

describe("drawAdvancerCode", () => {
  it("resolves the home and away team codes", () => {
    expect(drawAdvancerCode(opts())).toBe("ARG");
    expect(drawAdvancerCode(opts({ advancerId: "ta" }))).toBe("BRA");
  });

  it("returns null outside knockout rounds", () => {
    expect(drawAdvancerCode(opts({ isKnockout: false }))).toBeNull();
  });

  it("returns null for non-draw scores", () => {
    expect(drawAdvancerCode(opts({ homeScore: 2, awayScore: 1 }))).toBeNull();
  });

  it("returns null when scores are missing", () => {
    expect(drawAdvancerCode(opts({ homeScore: null }))).toBeNull();
    expect(drawAdvancerCode(opts({ awayScore: null }))).toBeNull();
  });

  it("returns null without an advancer", () => {
    expect(drawAdvancerCode(opts({ advancerId: null }))).toBeNull();
    expect(drawAdvancerCode(opts({ advancerId: undefined }))).toBeNull();
  });

  it("returns null when the advancer matches neither team", () => {
    expect(drawAdvancerCode(opts({ advancerId: "someone-else" }))).toBeNull();
    expect(drawAdvancerCode(opts({ home: null, away: null }))).toBeNull();
  });
});
