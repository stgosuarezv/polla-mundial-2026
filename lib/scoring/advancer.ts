interface TeamRef {
  id: string;
  code: string;
}

/**
 * Actual advancer for a knockout match: the explicitly recorded advancing
 * team, falling back to the penalty-shootout winner.
 */
export function actualAdvancerId(m: {
  advancing_team_id: string | null;
  penalty_winner_team_id: string | null;
}): string | null {
  return m.advancing_team_id ?? m.penalty_winner_team_id ?? null;
}

/**
 * Team code to display next to a drawn knockout score line ("1–1 (ARG)"),
 * or null when nothing should render: non-knockout rounds, non-draw scores,
 * missing scores, no advancer, or an advancer that matches neither team.
 */
export function drawAdvancerCode(opts: {
  isKnockout: boolean;
  homeScore: number | null;
  awayScore: number | null;
  advancerId: string | null | undefined;
  home: TeamRef | null;
  away: TeamRef | null;
}): string | null {
  const { isKnockout, homeScore, awayScore, advancerId, home, away } = opts;
  if (!isKnockout) return null;
  if (homeScore == null || awayScore == null) return null;
  if (homeScore !== awayScore) return null;
  if (!advancerId) return null;
  if (home && advancerId === home.id) return home.code;
  if (away && advancerId === away.id) return away.code;
  return null;
}
