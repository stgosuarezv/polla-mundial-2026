import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualAdvancerId, drawAdvancerCode } from "@/lib/scoring/advancer";

interface Props {
  params: Promise<{ locale: string; userId: string }>;
}

function teamName(
  team: { name_en: string; name_es: string; name_ko: string } | null,
  locale: string
) {
  if (!team) return "TBD";
  if (locale === "ko") return team.name_ko;
  if (locale === "en") return team.name_en;
  return team.name_es;
}

export default async function UserPredictionsPage({ params }: Props) {
  const { locale, userId } = await params;
  const t = await getTranslations("scoreboard");
  const tRounds = await getTranslations("rounds");
  const tPred = await getTranslations("predictions");
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Fetch profile and locked rounds in parallel — no dependency between them
  const [{ data: profile }, { data: rounds }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single(),
    supabase
      .from("rounds")
      .select(
        `id, stage, name_key, order_index, lock_time,
         matches (
           id, kickoff_at, status,
           home_score, away_score, penalty_winner_team_id, advancing_team_id,
           home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
           away_team:away_team_id ( id, code, name_en, name_es, name_ko )
         )`
      )
      .neq("stage", "podio")
      .lte("lock_time", now)
      .order("order_index", { ascending: true }),
  ]);

  if (!profile) notFound();

  // Fetch that user's predictions for these rounds (RLS allows after lock)
  const matchIds = (rounds ?? []).flatMap((r) =>
    (r.matches ?? []).map((m) => m.id)
  );

  const { data: predictions } = matchIds.length
    ? await supabase
        .from("predictions")
        .select(
          "match_id, home_score_pred, away_score_pred, penalty_winner_team_id, points_awarded"
        )
        .eq("user_id", userId)
        .in("match_id", matchIds)
    : { data: [] };

  const predMap = new Map(
    (predictions ?? []).map((p) => [p.match_id, p])
  );

  const totalPoints = (predictions ?? []).reduce(
    (sum, p) => sum + (p.points_awarded ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/scoreboard`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("backToScoreboard")}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{profile.display_name}</h1>
        <p className="text-sm text-muted-foreground">
          {totalPoints} {tPred("pts")} total
        </p>
      </div>

      {(rounds ?? []).length === 0 ? (
        <p className="text-muted-foreground">{tPred("locked")}</p>
      ) : (
        (rounds ?? []).map((round) => {
          const roundKey = round.name_key.replace(
            "rounds.",
            ""
          ) as Parameters<typeof tRounds>[0];
          const matches = (round.matches ?? []).sort(
            (a, b) =>
              new Date(a.kickoff_at).getTime() -
              new Date(b.kickoff_at).getTime()
          );

          const roundPoints = matches.reduce((sum, m) => {
            const p = predMap.get(m.id);
            return sum + (p?.points_awarded ?? 0);
          }, 0);

          return (
            <section key={round.id}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-semibold">{tRounds(roundKey)}</h2>
                <span className="ml-auto text-sm font-bold text-primary">
                  {roundPoints} {tPred("pts")}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {tPred("result")}
                      </th>
                      <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">
                        {tPred("yourPrediction")}
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                        {tPred("pts")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {matches.map((match) => {
                      const ht = Array.isArray(match.home_team)
                        ? match.home_team[0]
                        : match.home_team;
                      const at = Array.isArray(match.away_team)
                        ? match.away_team[0]
                        : match.away_team;
                      const pred = predMap.get(match.id);
                      const isKnockout = round.stage === "knockout";
                      const actualAdv = drawAdvancerCode({
                        isKnockout,
                        homeScore: match.home_score,
                        awayScore: match.away_score,
                        advancerId: actualAdvancerId(match),
                        home: ht ?? null,
                        away: at ?? null,
                      });
                      const predAdv = pred
                        ? drawAdvancerCode({
                            isKnockout,
                            homeScore: pred.home_score_pred,
                            awayScore: pred.away_score_pred,
                            advancerId: pred.penalty_winner_team_id,
                            home: ht ?? null,
                            away: at ?? null,
                          })
                        : null;

                      return (
                        <tr key={match.id} className="hover:bg-muted/20">
                          <td className="px-2 py-2">
                            <span className="font-medium">
                              {teamName(ht ?? null, locale)}
                            </span>
                            {match.home_score != null &&
                            match.away_score != null ? (
                              <span className="mx-1 text-muted-foreground">
                                {match.home_score}–{match.away_score}
                                {actualAdv && ` (${actualAdv})`}
                              </span>
                            ) : (
                              <span className="mx-1 text-muted-foreground">
                                vs
                              </span>
                            )}
                            <span className="font-medium">
                              {teamName(at ?? null, locale)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {pred ? (
                              <span>
                                {pred.home_score_pred}–{pred.away_score_pred}
                                {predAdv && ` (${predAdv})`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {pred ? (
                              <span
                                className={
                                  (pred.points_awarded ?? 0) > 0
                                    ? "font-bold text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                {pred.points_awarded ?? "—"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
