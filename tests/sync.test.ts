import { describe, it, expect } from "vitest";
import { resolveTeamFill } from "../lib/sync";
import type { FdMatchResult } from "../lib/sync";

// Helper: build a minimal FdMatchResult for the team-fill branch (not FINISHED)
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
