import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeLeaderboard } from "@/lib/scoring/scoring";
import { summarizeMatchPredictions } from "@/lib/scoring/prediction-summary";
import {
  NextMatchSummary,
  type NextMatchSummaryItem,
} from "@/components/scoreboard/next-match-summary";
import { PdfButton } from "@/components/rules/pdf-button";
import { DownloadImageButton } from "@/components/scoreboard/download-image-button";
import { StatusColumnsToggle } from "@/components/scoreboard/status-columns-toggle";
import { cn } from "@/lib/utils";

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

type CompletionState = "complete" | "partial" | "empty";

function statusOf(made: number, total: number): CompletionState {
  if (total === 0) return "empty";
  if (made === 0) return "empty";
  if (made >= total) return "complete";
  return "partial";
}

interface StatusBadgeProps {
  state: CompletionState;
  label: string;
}

const STATUS_KEY: Record<CompletionState, "statusComplete" | "statusPartial" | "statusEmpty"> = {
  complete: "statusComplete",
  partial: "statusPartial",
  empty: "statusEmpty",
};

function StatusBadge({ state, label }: StatusBadgeProps) {
  if (state === "complete") {
    return (
      <span className="text-xs font-medium" style={{ color: "#16a34a" }}>
        {label}
      </span>
    );
  }
  if (state === "partial") {
    return (
      <span className="text-xs font-medium" style={{ color: "#d97706" }}>
        {label}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {label}
    </span>
  );
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // All profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name");

  // Finished matches with stage (group/knockout) for perfect-match hit detection
  const { data: finishedMatches } = await supabase
    .from("matches")
    .select("id, rounds(stage)")
    .eq("status", "finished");

  const finishedWithStage = (finishedMatches ?? []).flatMap((m) => {
    const roundData = Array.isArray(m.rounds) ? m.rounds[0] : m.rounds;
    const stage: "group" | "knockout" =
      roundData?.stage === "group" ? "group" : "knockout";
    return [{ id: m.id, stage }];
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

  const predictions = (preds ?? []).map((p) => ({
    userId: p.user_id,
    matchId: p.match_id,
    pointsAwarded: p.points_awarded,
  }));

  const rows = computeLeaderboard(users, finishedWithStage, predictions);

  // ── Prediction completion per player ────────────────────────────────────────
  // SECURITY DEFINER fn returns counts only (no pick content) so it can see
  // other players' unlocked-round predictions without leaking the actual picks.
  const { data: completionData } = await supabase.rpc("prediction_completion");
  const completionByUser = new Map<
    string,
    { made: number; total: number; podioSlots: number }
  >();
  for (const c of completionData ?? []) {
    completionByUser.set(c.user_id, {
      made: Number(c.made),
      total: Number(c.total),
      podioSlots: c.podio_slots,
    });
  }

  // ── Next-match preview ──────────────────────────────────────────────────────
  // Take the soonest match(es) not yet finished — including in-play ones, so
  // the stats stay visible while a match is being played. Two simultaneous
  // group matches are common (same kickoff_at) so we include all of them.
  // Limit to 4 just in case.
  const nowIso = new Date().toISOString();
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
  const nextMatches = (upcoming ?? [])
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
  const closedNextIds = nextMatches
    .filter((m) => m.roundClosed)
    .map((m) => m.id);
  const { data: nextPreds } = closedNextIds.length
    ? await supabase
        .from("predictions")
        .select("user_id, match_id, home_score_pred, away_score_pred")
        .in("match_id", closedNextIds)
    : { data: [] };
  const nextPredByKey = new Map<
    string,
    { home_score_pred: number; away_score_pred: number }
  >();
  for (const p of nextPreds ?? []) {
    nextPredByKey.set(`${p.user_id}:${p.match_id}`, {
      home_score_pred: p.home_score_pred,
      away_score_pred: p.away_score_pred,
    });
  }

  // ── Next-match prediction summary (bet365-style outcome/scoreline grid) ────
  const nameByUserId = new Map(users.map((u) => [u.id, u.displayName]));
  const nextSummaries: NextMatchSummaryItem[] = nextMatches
    .filter((m) => m.roundClosed)
    .map((m) => {
      const preds = (nextPreds ?? [])
        .filter((p) => p.match_id === m.id)
        .map((p) => ({
          home: p.home_score_pred,
          away: p.away_score_pred,
          player: nameByUserId.get(p.user_id) ?? "—",
        }));
      return {
        id: m.id,
        homeCode: teamCode(m.home),
        awayCode: teamCode(m.away),
        kickoffLabel: formatKickoffCL(m.kickoff_at, locale),
        summary: summarizeMatchPredictions(preds),
      };
    })
    .filter((s) => s.summary.total > 0);

  // Tied ranks split the combined pot for the positions they occupy.
  // E.g. three players tied at rank 1 share prizes for positions 1, 2 and 3.
  const prizeByRank = new Map<number, number>();
  for (let i = 0; i < rows.length; ) {
    const rank = rows[i]!.rank;
    let j = i;
    while (j < rows.length && rows[j]!.rank === rank) j++;
    const groupSize = j - i;
    let pot = 0;
    for (let k = 0; k < groupSize; k++) {
      pot += PRIZES_CLP[rank - 1 + k] ?? 0;
    }
    if (pot > 0) prizeByRank.set(rank, Math.round(pot / groupSize));
    i = j;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#1A2855] dark:text-foreground">{t("title")}</h1>
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

      <NextMatchSummary matches={nextSummaries} />

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("noData")}</p>
      ) : (
        <StatusColumnsToggle label={t("toggleStatusColumns")}>
        <div id="scoreboard-table" className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "rgba(26, 40, 85, 0.07)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {t("rank")}
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {t("player")}
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  {t("points")}
                </th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">
                  {t("hits")}
                </th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">
                  {t("zeros")}
                </th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">
                  {t("gap")}
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  {t("prize")}
                </th>
                {nextMatches.map((m) => (
                  <th
                    key={m.id}
                    className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                  >
                    <div className="text-xs">
                      {teamCode(m.home)}–{teamCode(m.away)}
                    </div>
                    <div className="text-[10px] font-normal text-muted-foreground/70">
                      {formatKickoffCL(m.kickoff_at, locale)}
                    </div>
                  </th>
                ))}
                <th
                  data-status-col=""
                  className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                >
                  {t("completion")}
                </th>
                <th
                  data-status-col=""
                  className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                >
                  {t("podio")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const isMe = row.userId === user?.id;
                const prizeAmount = prizeByRank.get(row.rank);
                const prize =
                  prizeAmount !== undefined ? formatCLP(locale, prizeAmount) : "—";
                return (
                  <tr
                    key={row.userId}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      isMe && "bg-highlight/10 font-semibold"
                    )}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/${locale}/profile/${row.userId}`}
                        className="hover:underline"
                      >
                        {row.displayName}
                      </Link>
                      {isMe && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {t("you")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-primary">
                      {row.totalPoints}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-muted-foreground sm:table-cell">
                      {row.matchesHit}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-muted-foreground sm:table-cell">
                      {row.zeroMatches}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-muted-foreground md:table-cell">
                      {row.deltaFromLeader < 0
                        ? `${row.deltaFromLeader}`
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right whitespace-nowrap",
                        prizeAmount !== undefined
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {prize}
                    </td>
                    {nextMatches.map((m) => {
                      const pred = m.roundClosed
                        ? nextPredByKey.get(`${row.userId}:${m.id}`)
                        : undefined;
                      return (
                        <td
                          key={m.id}
                          className="px-3 py-2.5 text-center text-muted-foreground whitespace-nowrap"
                        >
                          {pred
                            ? `${pred.home_score_pred}–${pred.away_score_pred}`
                            : "—"}
                        </td>
                      );
                    })}
                    <td data-status-col="" className="px-3 py-2.5 text-center">
                      {(() => {
                        const c = completionByUser.get(row.userId);
                        if (!c || c.total === 0) return <span className="text-xs text-muted-foreground">—</span>;
                        const state = statusOf(c.made, c.total);
                        const label = t(STATUS_KEY[state]);
                        return <StatusBadge state={state} label={label} />;
                      })()}
                    </td>
                    <td data-status-col="" className="px-3 py-2.5 text-center">
                      {(() => {
                        const c = completionByUser.get(row.userId);
                        const slots = c?.podioSlots ?? 0;
                        const state = statusOf(slots, 3);
                        const label = t(STATUS_KEY[state]);
                        return <StatusBadge state={state} label={label} />;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </StatusColumnsToggle>
      )}
    </div>
  );
}
