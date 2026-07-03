export interface CalzometroMatch {
  id: string;
  label: string;
  kickoffAt: string;
  stage: "group" | "knockout";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeCode: string;
  awayCode: string;
  roundNameKey: string;
  roundOrderIndex: number;
}

export interface CalzometroPred {
  userId: string;
  matchId: string;
  home: number;
  away: number;
  penaltyWinnerId: string | null;
}

export interface CalzometroRow {
  matchId: string;
  label: string;
  pickA: string | null;
  pickB: string | null;
  equal: boolean;
}

export interface CalzometroPair {
  userAId: string;
  userBId: string;
  userAName: string;
  userBName: string;
  equalCount: number;
  bothCount: number;
  rows: CalzometroRow[];
}

export interface CalzometroResult {
  roundNameKey: string;
  matchCount: number;
  topPairs: CalzometroPair[];
  tiedPairCount: number;
}

interface Pick {
  key: string;
  display: string;
}

function buildPick(pred: CalzometroPred, match: CalzometroMatch): Pick {
  const isKnockoutDraw = match.stage === "knockout" && pred.home === pred.away;
  // A predicted knockout draw only equals another if the penalty/advancing
  // winner also matches (null == null). Non-draw picks ignore the winner field.
  const key = isKnockoutDraw
    ? `${pred.home}:${pred.away}:${pred.penaltyWinnerId ?? "?"}`
    : `${pred.home}:${pred.away}`;

  let display = `${pred.home}–${pred.away}`;
  if (isKnockoutDraw && pred.penaltyWinnerId) {
    const code =
      pred.penaltyWinnerId === match.homeTeamId
        ? match.homeCode
        : pred.penaltyWinnerId === match.awayTeamId
          ? match.awayCode
          : null;
    if (code) display += ` (${code})`;
  }
  return { key, display };
}

/**
 * "El Calzómetro": finds the pair of players with the most identical picks in
 * the latest locked round. Pure banter — reveals nothing that isn't already
 * public post-lock in the match-stats browser. Symmetric by construction (the
 * data has no direction, so neither does the output).
 *
 * Returns null (section hidden) when: no locked matches, fewer than two
 * participants, no eligible pair (both-submitted >= 2 and >= 1 identical), or
 * the top pair matches on less than half its shared picks (a limp calzón is
 * not worth announcing).
 */
export function computeCalzometro(
  lockedMatches: CalzometroMatch[],
  preds: CalzometroPred[],
  nameByUserId: Map<string, string>
): CalzometroResult | null {
  if (lockedMatches.length === 0) return null;

  const maxOrder = Math.max(...lockedMatches.map((m) => m.roundOrderIndex));
  const roundMatches = lockedMatches
    .filter((m) => m.roundOrderIndex === maxOrder)
    .sort(
      (a, b) =>
        a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id)
    );
  const matchById = new Map(roundMatches.map((m) => [m.id, m]));

  // userId → matchId → canonical pick
  const picksByUser = new Map<string, Map<string, Pick>>();
  for (const p of preds) {
    const match = matchById.get(p.matchId);
    if (!match) continue;
    let byMatch = picksByUser.get(p.userId);
    if (!byMatch) {
      byMatch = new Map();
      picksByUser.set(p.userId, byMatch);
    }
    byMatch.set(p.matchId, buildPick(p, match));
  }

  const participants = [...picksByUser.keys()].sort();
  if (participants.length < 2) return null;

  interface Candidate {
    a: string;
    b: string;
    equalCount: number;
    bothCount: number;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const pa = picksByUser.get(participants[i]!)!;
      const pb = picksByUser.get(participants[j]!)!;
      let bothCount = 0;
      let equalCount = 0;
      for (const m of roundMatches) {
        const a = pa.get(m.id);
        const b = pb.get(m.id);
        if (!a || !b) continue;
        bothCount++;
        if (a.key === b.key) equalCount++;
      }
      if (bothCount >= 2 && equalCount >= 1) {
        candidates.push({
          a: participants[i]!,
          b: participants[j]!,
          equalCount,
          bothCount,
        });
      }
    }
  }
  if (candidates.length === 0) return null;

  const nameOf = (id: string) => nameByUserId.get(id) ?? "—";
  const pairLabel = (c: Candidate) =>
    [nameOf(c.a), nameOf(c.b)].sort((x, y) => x.localeCompare(y)).join("|");

  candidates.sort(
    (x, y) =>
      y.equalCount - x.equalCount ||
      x.bothCount - y.bothCount ||
      pairLabel(x).localeCompare(pairLabel(y))
  );

  const top = candidates[0]!;
  // A "top pair" agreeing on under half its shared picks is base-rate noise.
  if (top.equalCount / top.bothCount < 0.5) return null;

  const tied = candidates.filter(
    (c) => c.equalCount === top.equalCount && c.bothCount === top.bothCount
  );

  const topPairs: CalzometroPair[] = tied.slice(0, 3).map((c) => {
    // Alphabetical display order — symmetric, never directional.
    const [firstId, secondId] = [c.a, c.b].sort((x, y) =>
      nameOf(x).localeCompare(nameOf(y))
    ) as [string, string];
    const pa = picksByUser.get(firstId)!;
    const pb = picksByUser.get(secondId)!;
    const rows: CalzometroRow[] = roundMatches.map((m) => {
      const a = pa.get(m.id) ?? null;
      const b = pb.get(m.id) ?? null;
      return {
        matchId: m.id,
        label: m.label,
        pickA: a?.display ?? null,
        pickB: b?.display ?? null,
        equal: !!a && !!b && a.key === b.key,
      };
    });
    return {
      userAId: firstId,
      userBId: secondId,
      userAName: nameOf(firstId),
      userBName: nameOf(secondId),
      equalCount: c.equalCount,
      bothCount: c.bothCount,
      rows,
    };
  });

  return {
    roundNameKey: roundMatches[0]!.roundNameKey,
    matchCount: roundMatches.length,
    topPairs,
    tiedPairCount: tied.length,
  };
}
