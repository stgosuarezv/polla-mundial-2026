import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeLeaderboard } from "@/lib/scoring/scoring";
import { buildRankHistory } from "@/lib/scoring/rank-history";
import { loadMatchSummaries } from "@/lib/scoring/match-summaries";
import {
  MatchStatsBrowser,
  type MatchStatsGroup,
} from "@/components/scoreboard/match-stats-browser";
import type { MatchStatsItem } from "@/components/scoreboard/match-stats-card";
import { ScoreboardTable } from "@/components/scoreboard/scoreboard-table";
import type { NextMatchCol } from "@/components/scoreboard/scoreboard-table";
import { TrajectorySection } from "@/components/scoreboard/trajectory-section";
import { PdfButton } from "@/components/rules/pdf-button";
import { DownloadImageButton } from "@/components/scoreboard/download-image-button";
import type { WhatIfMatch, WhatIfPredEntry } from "@/lib/scoring/what-if";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // All profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name");

  // Finished matches with stage + team codes. Stage drives perfect-match hit
  // detection; team codes label the per-match rank-trajectory chart.
  const { data: finishedMatches } = await supabase
    .from("matches")
    .select(
      `id, kickoff_at, rounds(stage, name_key),
       home_team:home_team_id ( code ),
       away_team:away_team_id ( code )`
    )
    .eq("status", "finished");

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

  // All predictions for finished matches (RLS allows seeing others' in locked
  // rounds). Paginated: 50 players × 100+ matches exceeds the 1,000-row cap.
  const { data: preds } = finishedIds.length
    ? await fetchAllRows<{
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
    : { data: [] };

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
  }));

  // nameByUserId used by loadMatchSummaries
  const nameByUserId = new Map(users.map((u) => [u.id, u.displayName]));

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

  // ── Prediction completion per player ────────────────────────────────────────
  // SECURITY DEFINER fn returns counts only (no pick content) so it can see
  // other players' unlocked-round predictions without leaking the actual picks.
  const { data: completionData } = await supabase.rpc("prediction_completion");
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

  // ── Match-stats browser ──────────────────────────────────────────────────────
  // All matches from locked rounds — used to populate the browseable stat panel
  // (dropdown). Filtering by locked rounds is done client-side: PostgREST does
  // not expose a clean way to filter on a join column via the JS client.
  const { data: allMatchesWithRound } = await supabase
    .from("matches")
    .select(
      `id, kickoff_at, status,
       home_score, away_score, advancing_team_id, penalty_winner_team_id,
       home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
       away_team:away_team_id ( id, code, name_en, name_es, name_ko ),
       rounds!inner ( lock_time, stage )`
    )
    .order("kickoff_at", { ascending: true });

  const lockedMatchesForBrowser = (allMatchesWithRound ?? []).filter((m) => {
    const round = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    return round && round.lock_time <= nowIso;
  });

  const summaryByMatchId = await loadMatchSummaries(
    supabase,
    lockedMatchesForBrowser.map((m) => m.id),
    nameByUserId
  );

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

  const whatIfMatchIds = lockedMatchesForBrowser.map((m) => m.id);

  // Fetch everyone's predictions for these matches (incl. penalty_winner_team_id
  // for knockout scoring). Uses fetchAllRows to avoid the 1,000-row cap.
  const { data: whatIfPreds } = whatIfMatchIds.length
    ? await fetchAllRows<{
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
    : { data: [] };

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
  // Take the soonest match(es) not yet finished — including in-play ones, so
  // the stats stay visible while a match is being played. Two simultaneous
  // group matches are common (same kickoff_at) so we include all of them.
  // Limit to 4 just in case.
  const { data: upcoming } = await supabase
    .from("matches")
    .select(
      `id, kickoff_at, round_id,
       home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
       away_team:away_team_id ( id, code, name_en, name_es, name_ko ),
       rounds!inner ( id, lock_time )`
    )
    .neq("status", "finished")
    .order("kickoff_at", { ascending: true })
    .limit(4);

  const earliestKickoff = upcoming?.[0]?.kickoff_at;
  const nextMatchesRaw = (upcoming ?? [])
    .filter((m) => m.kickoff_at === earliestKickoff)
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

  // Predictions only for matches whose round has already locked.
  const closedNextIds = nextMatchesRaw
    .filter((m) => m.roundClosed)
    .map((m) => m.id);
  const { data: nextPreds } = closedNextIds.length
    ? await supabase
        .from("predictions")
        .select("user_id, match_id, home_score_pred, away_score_pred")
        .in("match_id", closedNextIds)
    : { data: [] };

  // Serialize as plain Records for the client component (no Maps across boundary)
  const nextPredByKey: Record<string, { home: number; away: number }> = {};
  for (const p of nextPreds ?? []) {
    nextPredByKey[`${p.user_id}:${p.match_id}`] = {
      home: p.home_score_pred,
      away: p.away_score_pred,
    };
  }

  const nextMatches: NextMatchCol[] = nextMatchesRaw.map((m) => ({
    id: m.id,
    homeCode: teamCode(m.home),
    awayCode: teamCode(m.away),
    kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
    roundClosed: m.roundClosed,
  }));

  // Serialize completionByUser Map → plain Record for client component
  const completionByUser: Record<
    string,
    { made: number; total: number; podioSlots: number }
  > = Object.fromEntries(completionByUserMap);

  // Serialize lastMatchPts Map → plain Record for client component
  const lastMatchPts: Record<string, number> = Object.fromEntries(lastMatchPtsMap);
  const showLastMatch = lastMatchIds.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#1A2855] dark:text-foreground">
          {t("title")}
        </h1>
        <div className="flex items-center gap-2">
          <DownloadImageButton
            targetId="scoreboard-table"
            fileName="tabla-polla-mundial.png"
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
          nextMatches={nextMatches}
          nextPredByKey={nextPredByKey}
          completionByUser={completionByUser}
          whatIfMatches={whatIfMatches}
          predByKey={predByKey}
          realPtsByKey={realPtsByKey}
        />
      )}

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
