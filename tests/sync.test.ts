import { describe, it, expect } from "vitest";
import { resolveTeamFill, resolveFinishedScore } from "../lib/sync";
import type { FdMatchResult } from "../lib/sync";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a FINISHED FdMatchResult for score-resolution tests. */
function fdFinished(opts: {
  homeScore: number;
  awayScore: number;
  homeTla: string;
  awayTla: string;
  penalties?: { home: number; away: number };
  extraTime?: { home: number; away: number };
  duration?: FdMatchResult["score"]["duration"];
}): FdMatchResult {
  const hasPen = !!opts.penalties;
  return {
    id: 1,
    status: "FINISHED",
    homeTeam: { id: 1, tla: opts.homeTla },
    awayTeam: { id: 2, tla: opts.awayTla },
    score: {
      winner: hasPen ? "HOME_TEAM" : opts.homeScore > opts.awayScore ? "HOME_TEAM" : "AWAY_TEAM",
      duration: opts.duration ?? (hasPen ? "PENALTY_SHOOTOUT" : "REGULAR"),
      fullTime: { home: opts.homeScore, away: opts.awayScore },
      halfTime: { home: 0, away: 0 },
      extraTime: opts.extraTime ?? null,
      penalties: opts.penalties ?? null,
    },
  };
}

/** Build a minimal FdMatchResult for the team-fill branch (not FINISHED). */
function fdMatch(
  id: number,
  homeId: number | null,
  homeTla: string | null,
  awayId: number | null,
  awayTla: string | null
): FdMatchResult {
  return {
    id,
    status: "SCHEDULED",
    homeTeam: { id: homeId, tla: homeTla },
    awayTeam: { id: awayId, tla: awayTla },
    score: {
      winner: null,
      duration: "REGULAR",
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
    },
  };
}

const teamByCode = new Map([
  ["ARG", "uuid-arg"],
  ["BRA", "uuid-bra"],
  ["FRA", "uuid-fra"],
  ["ENG", "uuid-eng"],
  ["GER", "uuid-ger"],
  ["PAR", "uuid-par"],
]);

describe("resolveTeamFill", () => {
  it("fills null home slot when FD provides a known team", () => {
    const result = resolveTeamFill(
      { home_team_id: null, away_team_id: "uuid-bra" },
      fdMatch(1, 3, "ARG", 7, "BRA"),
      teamByCode
    );
    expect(result).toEqual({ home_team_id: "uuid-arg" });
  });

  it("fills null away slot when FD provides a known team", () => {
    const result = resolveTeamFill(
      { home_team_id: "uuid-arg", away_team_id: null },
      fdMatch(1, 3, "ARG", 7, "BRA"),
      teamByCode
    );
    expect(result).toEqual({ away_team_id: "uuid-bra" });
  });

  it("fills both null slots when FD provides both teams", () => {
    const result = resolveTeamFill(
      { home_team_id: null, away_team_id: null },
      fdMatch(1, 3, "ARG", 7, "BRA"),
      teamByCode
    );
    expect(result).toEqual({ home_team_id: "uuid-arg", away_team_id: "uuid-bra" });
  });

  it("returns null when both slots already set — no-op write", () => {
    const result = resolveTeamFill(
      { home_team_id: "uuid-arg", away_team_id: "uuid-bra" },
      fdMatch(1, 3, "ARG", 7, "BRA"),
      teamByCode
    );
    expect(result).toBeNull();
  });

  it("returns null when FD home team is still TBD (id null)", () => {
    const result = resolveTeamFill(
      { home_team_id: null, away_team_id: null },
      fdMatch(1, null, null, null, null),
      teamByCode
    );
    expect(result).toBeNull();
  });

  it("returns null when FD resolves a team but it is not in our DB (unknown code)", () => {
    const result = resolveTeamFill(
      { home_team_id: null, away_team_id: null },
      fdMatch(1, 99, "XYZ", 7, "BRA"),
      teamByCode
    );
    // XYZ not in teamByCode, BRA is — only away can be filled
    expect(result).toEqual({ away_team_id: "uuid-bra" });
  });

  it("never overwrites an existing home assignment even if FD differs", () => {
    const result = resolveTeamFill(
      { home_team_id: "uuid-fra", away_team_id: null },
      fdMatch(1, 3, "ARG", 7, "BRA"),
      teamByCode
    );
    // home already set → only away gets filled
    expect(result).toEqual({ away_team_id: "uuid-bra" });
  });

  it("is case-insensitive on FD tla codes", () => {
    const result = resolveTeamFill(
      { home_team_id: null, away_team_id: null },
      fdMatch(1, 3, "arg", 7, "bra"),  // lower-case from FD
      teamByCode
    );
    expect(result).toEqual({ home_team_id: "uuid-arg", away_team_id: "uuid-bra" });
  });
});

// ── resolveFinishedScore ──────────────────────────────────────────────────────

describe("resolveFinishedScore", () => {
  // The real Germany–Paraguay match (external_id 537415, 2026-06-29).
  // football-data.org returns fullTime 4-5, penalties 3-4.
  // Desired stored score: 1-1 (regulation/ET), advancer = Paraguay (away).
  it("penalty shootout: subtracts shootout tally from fullTime (real GER–PAR case)", () => {
    const m = fdFinished({
      homeScore: 4,   // fullTime already includes the 3 penalty goals
      awayScore: 5,   // fullTime already includes the 4 penalty goals
      homeTla: "GER",
      awayTla: "PAR",
      penalties: { home: 3, away: 4 },
      extraTime: { home: 0, away: 0 },
    });
    const result = resolveFinishedScore(m, teamByCode);
    expect(result).toEqual({
      homeScore: 1,
      awayScore: 1,
      penaltyWinnerTeamId: "uuid-par",
      advancingTeamId: "uuid-par",
    });
  });

  it("extra-time win (no shootout): uses fullTime as-is, no ET double-counting", () => {
    // A 2-1 ET win. fullTime includes the ET goal. There are no penalties.
    const m = fdFinished({
      homeScore: 2,
      awayScore: 1,
      homeTla: "ARG",
      awayTla: "BRA",
      extraTime: { home: 1, away: 0 },
      duration: "EXTRA_TIME",
    });
    const result = resolveFinishedScore(m, teamByCode);
    expect(result).toEqual({
      homeScore: 2,
      awayScore: 1,
      penaltyWinnerTeamId: null,
      advancingTeamId: "uuid-arg",
    });
  });

  it("regulation win: uses fullTime as-is, advancer is winner", () => {
    const m = fdFinished({
      homeScore: 3,
      awayScore: 0,
      homeTla: "FRA",
      awayTla: "ENG",
      duration: "REGULAR",
    });
    const result = resolveFinishedScore(m, teamByCode);
    expect(result).toEqual({
      homeScore: 3,
      awayScore: 0,
      penaltyWinnerTeamId: null,
      advancingTeamId: "uuid-fra",
    });
  });

  it("draw (group stage): no advancer set", () => {
    const m = fdFinished({
      homeScore: 1,
      awayScore: 1,
      homeTla: "ARG",
      awayTla: "BRA",
      duration: "REGULAR",
    });
    const result = resolveFinishedScore(m, teamByCode);
    expect(result).toEqual({
      homeScore: 1,
      awayScore: 1,
      penaltyWinnerTeamId: null,
      advancingTeamId: null,
    });
  });

  it("returns null when fullTime is not yet available", () => {
    const m: FdMatchResult = {
      id: 1,
      status: "FINISHED",
      homeTeam: { id: 1, tla: "ARG" },
      awayTeam: { id: 2, tla: "BRA" },
      score: {
        winner: null,
        duration: "REGULAR",
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
    };
    expect(resolveFinishedScore(m, teamByCode)).toBeNull();
  });
});
