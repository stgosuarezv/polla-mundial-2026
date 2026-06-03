import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MatchCard } from "@/components/predictions/match-card";
import { Countdown } from "@/components/countdown";

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

  // Fetch all non-podio rounds with their matches and teams
  const { data: rounds } = await supabase
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
    .order("order_index", { ascending: true });

  // Fetch current user's predictions. The explicit user_id filter is required:
  // RLS also exposes other players' rows once a round locks, so without it the
  // page would render whichever row arrived last per match_id.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: predictions } = user
    ? await supabase
        .from("predictions")
        .select(
          "match_id, home_score_pred, away_score_pred, penalty_winner_team_id, points_awarded"
        )
        .eq("user_id", user.id)
    : { data: [] };

  const predByMatchId = new Map(
    (predictions ?? []).map((p) => [p.match_id, p])
  );

  // Find the next round to lock (countdown target)
  const nextRound = (rounds ?? []).find((r) => r.lock_time > now);

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

  return (
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

      {/* Round sections */}
      {(rounds ?? []).map((round) => {
        const isLocked = round.lock_time <= now;
        const matches = (round.matches ?? []).sort(
          (a, b) =>
            new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
        );

        const roundKey = round.name_key.replace(
          "rounds.",
          ""
        ) as Parameters<typeof tRounds>[0];

        return (
          <section key={round.id}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="border-l-4 border-highlight pl-3 text-lg font-semibold text-[#1A2855] dark:text-foreground">{tRounds(roundKey)}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isLocked
                    ? "bg-muted text-muted-foreground"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {isLocked ? t("locked") : t("open")}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    actualPenaltyWinnerId={match.penalty_winner_team_id}
                    isKnockout={round.stage === "knockout"}
                    isLocked={isLocked}
                    prediction={predByMatchId.get(match.id) ?? null}
                    t={tCard}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
