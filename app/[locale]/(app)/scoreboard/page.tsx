import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeLeaderboard } from "@/lib/scoring/scoring";
import { buildRankHistory } from "@/lib/scoring/rank-history";
import {
  loadMatchSummaries,
  type MatchMeta,
} from "@/lib/scoring/match-summaries";
import {
  MatchStatsBrowser,
  type MatchStatsGroup,
} from "@/components/scoreboard/match-stats-browser";
import type { MatchStatsItem } from "@/components/scoreboard/match-stats-card";
import { ScoreboardTable } from "@/components/scoreboard/scoreboard-table";
import type {
  NextMatchCol,
  PodioCells,
} from "@/components/scoreboard/scoreboard-table";
import { TrajectorySection } from "@/components/scoreboard/trajectory-section";
import { PdfButton } from "@/components/rules/pdf-button";
import { CalzometroSection } from "@/components/scoreboard/calzometro-section";
import {
  computeCalzometro,
  type CalzometroMatch,
} from "@/lib/scoring/calzometro";
import { FunQuotesSection } from "@/components/scoreboard/fun-quotes-section";
import { DownloadImageButton } from "@/components/scoreboard/download-image-button";
import type { WhatIfMatch, WhatIfPredEntry } from "@/lib/scoring/what-if";
import {
  OraculoSection,
  type OracleItem,
  type OracleRound,
} from "@/components/scoreboard/oraculo-section";
import {
  oracleConsensus,
  finishedOutcome,
  oracleVerdict,
} from "@/lib/scoring/oracle";

const PRIZES_CLP = [
  1_250_000, 500_000, 250_000, 150_000, 125_000, 100_000, 75_000, 50_000,
] as const;
const POOL_TOTAL_CLP = PRIZES_CLP.reduce((sum, n) => sum + n, 0);

function formatCLP(locale: string, amount: number): string {
  const tag = locale === "es" ? "es-CL" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface TeamLite {
  id: string;
  code: string;
  name_en: string;
  name_es: string;
  name_ko: string;
}

function teamCode(team: TeamLite | null | undefined): string {
  return team?.code ?? "TBD";
}

function teamName(
  team: TeamLite | null | undefined,
  locale: string
): string {
  if (!team) return "TBD";
  if (locale === "ko") return team.name_ko;
  if (locale === "en") return team.name_en;
  return team.name_es;
}

function formatKickoffCL(iso: string, locale: string): string {
  const tag = locale === "ko" ? "ko-KR" : locale === "en" ? "en-US" : "es-CL";
  return new Date(iso).toLocaleString(tag, {
    timeZone: "America/Santiago",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ScoreboardPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("scoreboard");
  const tRules = await getTranslations("rules");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // ── Parallel batch 1: all independent fetches ───────────────────────────────
  const [
    {
      data: { user },
    },
    { data: profiles },
    { data: finishedMatches },
    { data: completionData },
    { data: allMatchesWithRound },
    { data: upcoming },
    { data: podioRound },
    { data: podioPredsRaw },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("id, display_name"),
    // Finished matches with stage + team codes. Stage drives perfect-match hit
    // detection; team codes label the per-match rank-trajectory chart.
    supabase
      .from("matches")
      .select(
        `id, kickoff_at, rounds(stage, name_key),
         home_team:home_team_id ( code ),
         away_team:away_team_id ( code )`
      )
      .eq("status", "finished"),
    // SECURITY DEFINER fn returns counts only (no pick content) so it can see
    // other players' unlocked-round predictions without leaking the actual picks.
    supabase.rpc("prediction_completion"),
    // All matches from locked rounds — used to populate the browseable stat panel
    // (dropdown). Filtering by locked rounds is done client-side: PostgREST does
    // not expose a clean way to filter on a join column via the JS client.
    supabase
      .from("matches")
      .select(
        `id, kickoff_at, status,
         home_score, away_score, advancing_team_id, penalty_winner_team_id,
         home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
         away_team:away_team_id ( id, code, name_en, name_es, name_ko ),
         rounds!inner ( id, name_key, lock_time, stage, order_index )`
      )
      .order("kickoff_at", { ascending: true }),
    // Take the next 4 matches not yet finished — including in-play ones, so
    // the stats stay visible while a match is being played.
    supabase
      .from("matches")
      .select(
        `id, kickoff_at, round_id,
         home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
         away_team:away_team_id ( id, code, name_en, name_es, name_ko ),
         rounds!inner ( id, lock_time )`
      )
      .neq("status", "finished")
      .order("kickoff_at", { ascending: true })
      .limit(4),
    // Podio round lock — gates whether other players' podium picks are
    // readable at all (RLS: podio: view others when locked).
    supabase.from("rounds").select("lock_time").eq("stage", "podio").maybeSingle(),
    // Everyone's podium picks. Before the podio round locks, RLS returns only
    // the caller's own row; that's fine since the table only renders these
    // columns once podioLocked is true. ~1 row/user, no 1,000-row-cap concern.
    supabase.from("podio_predictions").select(
      `user_id,
       champion:teams!champion_team_id ( code, flag_url ),
       runner_up:teams!runner_up_team_id ( code, flag_url ),
       third_place:teams!third_place_team_id ( code, flag_url )`
    ),
  ]);

  // ── Derived values needed for batch 2 ───────────────────────────────────────
  const finishedWithStage = (finishedMatches ?? []).flatMap((m) => {
    const roundData = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    const stage: "group" | "knockout" =
      roundData?.stage === "group" ? "group" : "knockout";
    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
    const label = `${home?.code ?? "TBD"}-${away?.code ?? "TBD"}`;
    const kickoffDate = m.kickoff_at.slice(0, 10);
    const roundKey = roundData?.name_key ?? "unknown";
    return [{ id: m.id, stage, kickoffAt: m.kickoff_at, kickoffDate, roundKey, label }];
  });
  const finishedIds = finishedWithStage.map((m) => m.id);

  // nameByUserId used by loadMatchSummaries
  const nameByUserId = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name as string])
  );

  const lockedMatchesForBrowser = (allMatchesWithRound ?? []).filter((m) => {
    const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    return round && round.lock_time <= nowIso;
  });

  const whatIfMatchIds = lockedMatchesForBrowser.map((m) => m.id);

  const nextMatchesRaw = (upcoming ?? [])
    .map((m) => {
      const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
      const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
      const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
      return {
        id: m.id,
        kickoff_at: m.kickoff_at,
        home: home ?? null,
        away: away ?? null,
        roundClosed: round ? round.lock_time <= nowIso : false,
      };
    });

  // Predictions only for the next matches whose round has already locked
  // (each of the up-to-4 upcoming matches gets its own column once locked).
  const closedNextIds = nextMatchesRaw
    .filter((m) => m.roundClosed)
    .map((m) => m.id);

  const completionByUserMap = new Map<
    string,
    { made: number; total: number; podioSlots: number }
  >();
  for (const c of completionData ?? []) {
    completionByUserMap.set(c.user_id, {
      made: Number(c.made),
      total: Number(c.total),
      podioSlots: c.podio_slots,
    });
  }

  // Per-match metadata for loadMatchSummaries — used to split knockout draws by
  // who the player predicted to advance (e.g. "1–1 (BRA)" vs "1–1 (JPN)").
  const matchMetaMap = new Map<string, MatchMeta>();
  for (const m of lockedMatchesForBrowser) {
    const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
    matchMetaMap.set(m.id, {
      knockout: round?.stage === "knockout",
      homeTeamId: (home as TeamLite | null)?.id ?? null,
      homeCode: (home as TeamLite | null)?.code ?? "TBD",
      awayTeamId: (away as TeamLite | null)?.id ?? null,
      awayCode: (away as TeamLite | null)?.code ?? "TBD",
    });
  }

  // ── Parallel batch 2: fetches that depend on batch 1 ────────────────────────
  // All predictions for finished matches (RLS allows seeing others' in locked
  // rounds). Paginated: 50 players × 100+ matches exceeds the 1,000-row cap.
  const predsPromise = finishedIds.length
    ? fetchAllRows<{
        user_id: string;
        match_id: string;
        points_awarded: number | null;
      }>((from, to) =>
        supabase
          .from("predictions")
          .select("user_id, match_id, points_awarded")
          .in("match_id", finishedIds)
          .order("id")
          .range(from, to)
      )
    : Promise.resolve({
        data: [] as {
          user_id: string;
          match_id: string;
          points_awarded: number | null;
        }[],
      });

  // Fetch everyone's predictions for locked matches (incl. penalty_winner_team_id
  // for knockout scoring). Uses fetchAllRows to avoid the 1,000-row cap.
  const whatIfPredsPromise = whatIfMatchIds.length
    ? fetchAllRows<{
        user_id: string;
        match_id: string;
        home_score_pred: number;
        away_score_pred: number;
        penalty_winner_team_id: string | null;
      }>((from, to) =>
        supabase
          .from("predictions")
          .select(
            "user_id, match_id, home_score_pred, away_score_pred, penalty_winner_team_id"
          )
          .in("match_id", whatIfMatchIds)
          .order("id")
          .range(from, to)
      )
    : Promise.resolve({
        data: [] as {
          user_id: string;
          match_id: string;
          home_score_pred: number;
          away_score_pred: number;
          penalty_winner_team_id: string | null;
        }[],
      });

  const nextPredsPromise = closedNextIds.length
    ? supabase
        .from("predictions")
        .select("user_id, match_id, home_score_pred, away_score_pred, penalty_winner_team_id")
        .in("match_id", closedNextIds)
    : Promise.resolve({
        data: [] as {
          user_id: string;
          match_id: string;
          home_score_pred: number;
          away_score_pred: number;
          penalty_winner_team_id: string | null;
        }[],
      });

  const [
    { data: preds },
    summaryByMatchId,
    { data: whatIfPreds },
    { data: nextPreds },
  ] = await Promise.all([
    predsPromise,
    loadMatchSummaries(
      supabase,
      lockedMatchesForBrowser.map((m) => m.id),
      nameByUserId,
      matchMetaMap
    ),
    whatIfPredsPromise,
    nextPredsPromise,
  ]);

  // ── All derived computation ──────────────────────────────────────────────────
  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
  }));

  const predictions = (preds ?? []).map((p) => ({
    userId: p.user_id,
    matchId: p.match_id,
    pointsAwarded: p.points_awarded,
  }));

  const rows = computeLeaderboard(users, finishedWithStage, predictions);

  // ── Rank trajectory ("La Carrera") ───────────────────────────────
  // Rank-per-match per player, derived from the same finished-match data — no
  // stored history, no migration. Labels are "HOME-AWAY" team codes.
  const rankHistory = buildRankHistory(users, finishedWithStage, predictions);

  // Points from the most recently played match(es). Multiple matches can share
  // the same kickoff_at (common in group stage), so we sum all of them.
  const lastKickoffAt = (finishedMatches ?? []).reduce<string>(
    (max, m) => (m.kickoff_at > max ? m.kickoff_at : max),
    ""
  );
  const lastMatchIds = new Set(
    (finishedMatches ?? [])
      .filter((m) => m.kickoff_at === lastKickoffAt)
      .map((m) => m.id)
  );
  const lastMatchPtsMap = new Map<string, number>();
  for (const p of predictions) {
    if (lastMatchIds.has(p.matchId)) {
      lastMatchPtsMap.set(
        p.userId,
        (lastMatchPtsMap.get(p.userId) ?? 0) + (p.pointsAwarded ?? 0)
      );
    }
  }

  // ── Match-stats browser ──────────────────────────────────────────────────────
  // ── El Oráculo de la Polla (group consensus, just for fun) ───────────────────
  // Build one OracleItem per locked match that has predictions, grouped by
  // round. All consensus + verdict work happens server-side — no client JS,
  // no heavy MatchPredictionSummary payload crossing the wire.
  type OracleRoundAccum = Omit<OracleRound, "items"> & { items: OracleItem[] };
  const oracleRoundMap = new Map<string, OracleRoundAccum>();

  for (const m of lockedMatchesForBrowser) {
    if ((summaryByMatchId.get(m.id)?.total ?? 0) === 0) continue;
    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
    const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    if (!round) continue;

    const rawConsensus = oracleConsensus(summaryByMatchId.get(m.id)!);
    const consensus = {
      favorite: rawConsensus.favorite,
      shares: rawConsensus.shares,
      total: rawConsensus.total,
    };
    const isFinished =
      m.status === "finished" &&
      m.home_score != null &&
      m.away_score != null;
    const verdict = isFinished
      ? oracleVerdict(
          consensus.favorite,
          finishedOutcome({
            homeScore: m.home_score!,
            awayScore: m.away_score!,
            stage: round.stage ?? "group",
            homeTeamId: (home as TeamLite | null)?.id ?? null,
            awayTeamId: (away as TeamLite | null)?.id ?? null,
            advancingTeamId: (m.advancing_team_id as string | null) ?? null,
            penaltyWinnerTeamId:
              (m.penalty_winner_team_id as string | null) ?? null,
          })
        )
      : null;

    const item: OracleItem = {
      id: m.id,
      homeCode: teamCode(home as TeamLite | null),
      awayCode: teamCode(away as TeamLite | null),
      kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
      state:
        m.status === "in_progress"
          ? "live"
          : m.status === "finished"
            ? "finished"
            : "scheduled",
      consensus,
      result: isFinished ? { home: m.home_score!, away: m.away_score! } : null,
      verdict,
    };

    const acc = oracleRoundMap.get(round.id) ?? {
      id: round.id,
      nameKey: round.name_key as string,
      orderIndex: round.order_index as number,
      isCurrent: false,
      hits: 0,
      finishedCount: 0,
      items: [] as OracleItem[],
    };
    acc.items.push(item);
    if (m.status !== "finished") acc.isCurrent = true;
    if (isFinished) {
      acc.finishedCount++;
      if (verdict === "hit") acc.hits++;
    }
    oracleRoundMap.set(round.id, acc);
  }

  const oracleRounds: OracleRound[] = [...oracleRoundMap.values()].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  // Spotlight: soonest non-finished item + most recently finished item.
  const allOracleItems = oracleRounds.flatMap((r) => r.items);
  const oracleItems: OracleItem[] = [
    allOracleItems.find((i) => i.state !== "finished"),
    [...allOracleItems].reverse().find(
      (i) => i.state === "finished" && i.result !== null
    ),
  ].flatMap((i) => (i ? [i] : []));

  // Group by kickoff_at so simultaneous matches share one dropdown entry.
  type BrowserGroupRaw = {
    kickoffAt: string;
    hasUnfinished: boolean;
    items: MatchStatsItem[];
  };
  const browserGroupMap = new Map<string, BrowserGroupRaw>();
  for (const m of lockedMatchesForBrowser) {
    const summary = summaryByMatchId.get(m.id);
    if (!summary || summary.total === 0) continue; // no picks yet → skip

    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;

    const existing = browserGroupMap.get(m.kickoff_at) ?? {
      kickoffAt: m.kickoff_at,
      hasUnfinished: false,
      items: [] as MatchStatsItem[],
    };
    existing.items.push({
      id: m.id,
      homeCode: home?.code ?? "TBD",
      awayCode: away?.code ?? "TBD",
      kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
      summary,
    });
    if (m.status !== "finished") existing.hasUnfinished = true;
    browserGroupMap.set(m.kickoff_at, existing);
  }

  const browserGroups: MatchStatsGroup[] = [...browserGroupMap.values()]
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
    .map((g) => ({
      id: g.items[0]!.id,
      label:
        g.items.map((i) => `${i.homeCode}–${i.awayCode}`).join(" / ") +
        " · " +
        formatKickoffCL(g.kickoffAt, locale),
      items: g.items,
    }));

  // Default: soonest group that has an unfinished match (round locked but match
  // not yet played), else the latest group (most recently finished).
  const firstActiveRaw = [...browserGroupMap.values()].find(
    (g) => g.hasUnfinished
  );
  const defaultGroupId =
    (firstActiveRaw
      ? browserGroups.find((bg) =>
          bg.items.some((i) =>
            firstActiveRaw.items.some((ri) => ri.id === i.id)
          )
        )
      : browserGroups[browserGroups.length - 1]
    )?.id ?? "";

  // ── What-if simulator data ───────────────────────────────────────────────────
  // All locked matches (finished + upcoming) so players can simulate both
  // hypothetical future results and counterfactual past ones.
  // We reuse lockedMatchesForBrowser (already filtered by round lock_time).

  // predByKey: `${userId}:${matchId}` → prediction entry (plain Record for client)
  const predByKey: Record<string, WhatIfPredEntry> = {};
  for (const p of whatIfPreds ?? []) {
    predByKey[`${p.user_id}:${p.match_id}`] = {
      home: p.home_score_pred,
      away: p.away_score_pred,
      penaltyWinnerId: p.penalty_winner_team_id,
    };
  }

  // realPtsByKey: finished-match points from the already-fetched `predictions` array
  const realPtsByKey: Record<string, number> = {};
  const finishedIdSet = new Set(finishedIds);
  for (const p of predictions) {
    if (finishedIdSet.has(p.matchId)) {
      realPtsByKey[`${p.userId}:${p.matchId}`] = p.pointsAwarded ?? 0;
    }
  }

  // ── El Calzómetro (parallel-picks banter, just for fun) ─────────────────────
  // Reuses lockedMatchesForBrowser + whatIfPreds — zero new queries. Latest
  // locked round only, top pair only; reveals nothing that the match-stats
  // browser doesn't already show post-lock.
  const calzometroMatches: CalzometroMatch[] = lockedMatchesForBrowser.map(
    (m) => {
      const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
      const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
      const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
      return {
        id: m.id,
        label: `${teamCode(home as TeamLite | null)}–${teamCode(away as TeamLite | null)}`,
        kickoffAt: m.kickoff_at,
        stage: round?.stage === "group" ? ("group" as const) : ("knockout" as const),
        homeTeamId: (home as TeamLite | null)?.id ?? null,
        awayTeamId: (away as TeamLite | null)?.id ?? null,
        homeCode: teamCode(home as TeamLite | null),
        awayCode: teamCode(away as TeamLite | null),
        roundNameKey: round?.name_key ?? "",
        roundOrderIndex: round?.order_index ?? 0,
      };
    }
  );
  const calzometro = computeCalzometro(
    calzometroMatches,
    (whatIfPreds ?? []).map((wp) => ({
      userId: wp.user_id,
      matchId: wp.match_id,
      home: wp.home_score_pred,
      away: wp.away_score_pred,
      penaltyWinnerId: wp.penalty_winner_team_id,
    })),
    nameByUserId
  );

  // Map locked matches to the WhatIfMatch shape (types from lib/scoring/what-if)
  const whatIfMatches: WhatIfMatch[] = lockedMatchesForBrowser.map((m) => {
    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
    const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    const stage: "group" | "knockout" =
      round?.stage === "group" ? "group" : "knockout";
    const isFinished = m.status === "finished";
    return {
      id: m.id,
      roundId: round?.id ?? "",
      roundKey: (round?.name_key ?? "").replace("rounds.", ""),
      roundOrderIndex: round?.order_index ?? 0,
      stage,
      status: m.status,
      homeCode: home?.code ?? "TBD",
      awayCode: away?.code ?? "TBD",
      homeName: teamName(home as TeamLite | null, locale),
      awayName: teamName(away as TeamLite | null, locale),
      homeTeamId: (home as TeamLite | null)?.id ?? null,
      awayTeamId: (away as TeamLite | null)?.id ?? null,
      kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
      actual:
        isFinished && m.home_score != null && m.away_score != null
          ? {
              home: m.home_score,
              away: m.away_score,
              advancingTeamId:
                (m.advancing_team_id as string | null) ??
                (m.penalty_winner_team_id as string | null) ??
                null,
            }
          : null,
    };
  });

  // ── Next-match table-column preview ─────────────────────────────────────────
  // Serialize as plain Records for the client component (no Maps across boundary)
  const nextPredByKey: Record<
    string,
    { home: number; away: number; penaltyWinnerId: string | null }
  > = {};
  for (const p of nextPreds ?? []) {
    nextPredByKey[`${p.user_id}:${p.match_id}`] = {
      home: p.home_score_pred,
      away: p.away_score_pred,
      penaltyWinnerId: p.penalty_winner_team_id ?? null,
    };
  }

  const nextMatches: NextMatchCol[] = nextMatchesRaw.map((m) => ({
    id: m.id,
    homeCode: teamCode(m.home),
    awayCode: teamCode(m.away),
    homeTeamId: m.home?.id ?? null,
    awayTeamId: m.away?.id ?? null,
    kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
    roundClosed: m.roundClosed,
  }));

  // Serialize completionByUser Map → plain Record for client component
  const completionByUser: Record<
    string,
    { made: number; total: number; podioSlots: number }
  > = Object.fromEntries(completionByUserMap);

  // ── Podium (1st/2nd/3rd place) pick columns ─────────────────────────────────
  // Other players' rows are only visible once the podio round locks (RLS:
  // "podio: view others when locked"); until then podioPredsRaw only contains
  // the caller's own row, so gate rendering entirely on podioLocked.
  const podioLocked = !!podioRound && podioRound.lock_time <= nowIso;

  type PodioTeamLite = { code: string; flag_url: string | null };
  function podioCell(
    team: PodioTeamLite | PodioTeamLite[] | null | undefined
  ): PodioCells["first"] {
    const t = Array.isArray(team) ? team[0] : team;
    return t ? { code: t.code, flagUrl: t.flag_url } : null;
  }

  const podioByUser: Record<string, PodioCells> = {};
  for (const p of podioPredsRaw ?? []) {
    podioByUser[p.user_id] = {
      first: podioCell(p.champion as PodioTeamLite | PodioTeamLite[] | null),
      second: podioCell(p.runner_up as PodioTeamLite | PodioTeamLite[] | null),
      third: podioCell(p.third_place as PodioTeamLite | PodioTeamLite[] | null),
    };
  }

  // Serialize lastMatchPts Map → plain Record for client component
  const lastMatchPts: Record<string, number> = Object.fromEntries(lastMatchPtsMap);
  const showLastMatch = lastMatchIds.size > 0;

  // Rank before the last batch of matches — used for movement arrows in the
  // normal table. Only computed when there were matches before the last batch.
  const prevRankByUser: Record<string, number> = {};
  if (showLastMatch && finishedWithStage.length > lastMatchIds.size) {
    const nonLastPreds = predictions.filter((p) => !lastMatchIds.has(p.matchId));
    const nonLastMatches = finishedWithStage.filter(
      (m) => !lastMatchIds.has(m.id)
    );
    const prevRows = computeLeaderboard(users, nonLastMatches, nonLastPreds);
    for (const r of prevRows) {
      prevRankByUser[r.userId] = r.rank;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#1A2855] dark:text-foreground">
          {t("title")}
        </h1>
        <div className="flex items-center gap-2">
          <DownloadImageButton
            targetId="scoreboard-table"
            fileName="la-tablinha.png"
            label={t("downloadImage")}
          />
          <PdfButton label={tRules("downloadPdf")} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t.rich("poolCaption", {
          amount: formatCLP(locale, POOL_TOTAL_CLP),
          link: (chunks) => (
            <Link
              href={`/${locale}/rules`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <p className="text-sm text-muted-foreground">
        {t("playerCount", { count: rows.length })}
      </p>

      {browserGroups.length > 0 && (
        <div className="print:hidden">
          <MatchStatsBrowser
            groups={browserGroups}
            defaultGroupId={defaultGroupId}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("noData")}</p>
      ) : (
        <ScoreboardTable
          rows={rows}
          currentUserId={user?.id ?? null}
          locale={locale}
          prizes={PRIZES_CLP}
          lastMatchPts={lastMatchPts}
          showLastMatch={showLastMatch}
          prevRankByUser={prevRankByUser}
          nextMatches={nextMatches}
          nextPredByKey={nextPredByKey}
          completionByUser={completionByUser}
          podioByUser={podioByUser}
          podioLocked={podioLocked}
          whatIfMatches={whatIfMatches}
          predByKey={predByKey}
          realPtsByKey={realPtsByKey}
        />
      )}

      {oracleRounds.length > 0 && (
        <div className="print:hidden">
          <OraculoSection items={oracleItems} rounds={oracleRounds} />
        </div>
      )}

      {calzometro && (
        <div className="print:hidden">
          <CalzometroSection result={calzometro} />
        </div>
      )}

      <div className="print:hidden">
        <FunQuotesSection leaderName={rows[0]?.displayName ?? null} seed={nowIso} />
      </div>

      {rows.length > 0 && (
        <TrajectorySection
          series={rankHistory.series}
          stepLabels={rankHistory.stepLabels}
          stepDates={rankHistory.stepDates}
          stepRoundKeys={rankHistory.stepRoundKeys}
          currentUserId={user?.id ?? null}
          playerCount={rankHistory.playerCount}
        />
      )}
    </div>
  );
}
