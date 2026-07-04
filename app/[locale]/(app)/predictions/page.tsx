import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadMatchSummaries,
  type MatchMeta,
} from "@/lib/scoring/match-summaries";
import { MatchCard } from "@/components/predictions/match-card";
import { CollapsibleRound } from "@/components/predictions/collapsible-round";
import { RoundControls } from "@/components/predictions/round-controls";
import { PredictionsForm } from "@/components/predictions/predictions-form";
import { ViewToggle, MatchGrid } from "@/components/predictions/view-mode";
import { Countdown } from "@/components/countdown";
import { ExtraTimeBanner } from "@/components/predictions/extra-time-banner";

interface Props {
  params: Promise<{ locale: string }>;
}

function teamName(
  team: { name_en: string; name_es: string; name_ko: string } | null,
  locale: string
) {
  if (!team) return null;
  if (locale === "ko") return team.name_ko;
  if (locale === "en") return team.name_en;
  return team.name_es;
}

export default async function PredictionsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("predictions");
  const tRounds = await getTranslations("rounds");
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Reads from the my_predictions view (security_invoker, filters by auth.uid())
  // so this query can NEVER return another user's rows — even though the base
  // table's RLS exposes others' rows for locked rounds. See CLAUDE.md "User-data
  // queries". The explicit .eq filter is redundant with the view but kept as a
  // belt that signals intent.

  // Batch 1: rounds, auth user, and profiles are all independent
  const [
    { data: rounds },
    {
      data: { user },
    },
    { data: allProfiles },
  ] = await Promise.all([
    supabase
      .from("rounds")
      .select(
        `id, stage, name_key, order_index, lock_time,
         matches (
           id, kickoff_at, venue, status,
           home_score, away_score, penalty_winner_team_id, advancing_team_id,
           home_team:home_team_id ( id, code, name_en, name_es, name_ko, flag_url ),
           away_team:away_team_id ( id, code, name_en, name_es, name_ko, flag_url )
         )`
      )
      .neq("stage", "podio")
      .order("order_index", { ascending: true }),
    supabase.auth.getUser(),
    supabase.from("profiles").select("id, display_name"),
  ]);

  // Middleware guarantees auth before this page renders. A null user here means
  // the session cookie propagation failed — redirect to login rather than
  // silently rendering blank cards (which looks like data loss to the player).
  if (!user) redirect(`/${locale}/login`);

  // ── Prediction stats for locked matches ─────────────────────────────────────
  // Collect all match ids from locked rounds — RLS allows viewing other players'
  // predictions for these. Used to show a "Stats" button on locked match cards.
  const lockedMatchIds = (rounds ?? []).flatMap((r) =>
    r.lock_time <= now
      ? (r.matches ?? []).map((m: { id: string }) => m.id)
      : []
  );

  const nameByUserId = new Map(
    (allProfiles ?? []).map((p) => [p.id, p.display_name as string])
  );

  // Per-match metadata for loadMatchSummaries — resolves knockout-draw advancer
  // codes so "1–1 (BRA)" and "1–1 (JPN)" appear as separate chips in the card.
  const matchMetaMap = new Map<string, MatchMeta>();
  for (const r of rounds ?? []) {
    if (r.lock_time > now) continue;
    for (const m of r.matches ?? []) {
      const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team;
      const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team;
      matchMetaMap.set(m.id, {
        knockout: r.stage === "knockout",
        homeTeamId: home?.id ?? null,
        homeCode: home?.code ?? "TBD",
        awayTeamId: away?.id ?? null,
        awayCode: away?.code ?? "TBD",
      });
    }
  }

  // Batch 2: predictions (needs user.id) and summaries (needs lockedMatchIds +
  // nameByUserId) have no dependency on each other
  const [{ data: predictions }, summaryByMatchId] = await Promise.all([
    supabase
      .from("my_predictions")
      .select(
        "match_id, home_score_pred, away_score_pred, penalty_winner_team_id, points_awarded"
      )
      .eq("user_id", user.id),
    loadMatchSummaries(supabase, lockedMatchIds, nameByUserId, matchMetaMap),
  ]);

  const predByMatchId = new Map(
    (predictions ?? []).map((p) => [p.match_id, p])
  );

  // Find the next round to lock (countdown target)
  const nextRound = (rounds ?? []).find((r) => r.lock_time > now);

  // ── Default collapse state ──────────────────────────────────────────────────
  // A round only counts as "finished" once every one of its matches has
  // finished. Locked-but-still-playing rounds are NOT finished, so they stay
  // expanded by default to watch live results; only fully-finished rounds
  // collapse. When the whole tournament is over (every round finished), the
  // most recent round (last by order_index) is auto-opened so the page never
  // loads fully collapsed.
  const roundsList = rounds ?? [];
  const isRoundFinished = (r: (typeof roundsList)[number]) => {
    const ms = r.matches ?? [];
    return (
      ms.length > 0 &&
      ms.every((m: { status: string }) => m.status === "finished")
    );
  };
  const allFinished =
    roundsList.length > 0 && roundsList.every(isRoundFinished);
  const mostRecentRoundId = roundsList[roundsList.length - 1]?.id;

  const tCard = {
    noTeam: t("noTeam"),
    save: t("save"),
    saving: t("saving"),
    saved: t("saved"),
    errorSaving: t("errorSaving"),
    penaltyWinner: t("penaltyWinner"),
    pts: t("pts"),
    noPrediction: t("noPrediction"),
  };

  const tForm = {
    saveAll: t("saveAll"),
    saving: t("saving"),
    saved: t("saved"),
  };

  const tControls = {
    expandAll: t("expandAll"),
    collapseAll: t("collapseAll"),
  };

  return (
    <PredictionsForm labels={tForm}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[#1A2855] dark:text-foreground">{t("title")}</h1>

        {/* Countdown to next deadline */}
        {nextRound && (
          <Countdown
            lockTime={nextRound.lock_time}
            roundName={tRounds(
              nextRound.name_key.replace("rounds.", "") as Parameters<typeof tRounds>[0]
            )}
            label={t("closesIn")}
          />
        )}

        {/* Extra-time scoring note */}
        <ExtraTimeBanner message={t("extraTimeNote")} />

        {/* View toggle + expand / collapse all (open-state persistence) */}
        {roundsList.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ViewToggle
              labels={{ viewCards: t("viewCards"), viewList: t("viewList") }}
            />
            <RoundControls labels={tControls} />
          </div>
        )}

        {/* Round sections */}
        {roundsList.map((round) => {
          const isLocked = round.lock_time <= now;
          const defaultOpen =
            !isRoundFinished(round) ||
            (allFinished && round.id === mostRecentRoundId);
          const matches = (round.matches ?? []).sort(
            (a, b) =>
              new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
          );

          const roundKey = round.name_key.replace(
            "rounds.",
            ""
          ) as Parameters<typeof tRounds>[0];

          return (
            <CollapsibleRound
              key={round.id}
              id={round.id}
              title={tRounds(roundKey)}
              locked={isLocked}
              badgeLabel={isLocked ? t("locked") : t("open")}
              defaultOpen={defaultOpen}
            >
              <MatchGrid>
                {matches.map((match) => {
                  const ht = Array.isArray(match.home_team)
                    ? match.home_team[0]
                    : match.home_team;
                  const at = Array.isArray(match.away_team)
                    ? match.away_team[0]
                    : match.away_team;

                  return (
                    <MatchCard
                      key={match.id}
                      matchId={match.id}
                      homeTeam={
                        ht
                          ? { ...ht, name: teamName(ht, locale) ?? ht.code }
                          : null
                      }
                      awayTeam={
                        at
                          ? { ...at, name: teamName(at, locale) ?? at.code }
                          : null
                      }
                      kickoffAt={match.kickoff_at}
                      locale={locale}
                      status={match.status}
                      actualHome={match.home_score}
                      actualAway={match.away_score}
                      actualAdvancerId={
                        match.advancing_team_id ?? match.penalty_winner_team_id
                      }
                      isKnockout={round.stage === "knockout"}
                      isLocked={isLocked}
                      prediction={predByMatchId.get(match.id) ?? null}
                      summary={summaryByMatchId.get(match.id) ?? null}
                      t={tCard}
                    />
                  );
                })}
              </MatchGrid>
            </CollapsibleRound>
          );
        })}
      </div>
    </PredictionsForm>
  );
}
