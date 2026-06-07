import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export default async function ProfilePage({ params }: Props) {
  const { locale, userId } = await params;
  const t = await getTranslations("profile");
  const tRounds = await getTranslations("rounds");
  const tPred = await getTranslations("predictions");
  const tScoreboard = await getTranslations("scoreboard");
  const supabase = await createClient();
  const now = new Date();

  // Target user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .single();

  if (!profile) notFound();

  // Target user's email lives on auth.users, not profiles — read via admin client.
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? null;

  // All non-podio rounds
  const { data: roundsData } = await supabase
    .from("rounds")
    .select("id, stage, name_key, order_index, lock_time")
    .neq("stage", "podio")
    .order("order_index", { ascending: true });

  const rounds = roundsData ?? [];

  // Classify rounds
  const unlockedRounds = rounds.filter((r) => new Date(r.lock_time) > now);
  const currentRoundId =
    unlockedRounds.length > 0 ? unlockedRounds[0]!.id : null;

  // All matches with teams
  const { data: matchesData } = await supabase
    .from("matches")
    .select(
      `id, round_id, kickoff_at, status, home_score, away_score,
       home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
       away_team:away_team_id ( id, code, name_en, name_es, name_ko )`
    )
    .order("kickoff_at", { ascending: true });

  const allMatches = matchesData ?? [];

  // Predictions for locked rounds (RLS allows seeing others' predictions after lock)
  const lockedMatchIds = allMatches
    .filter((m) =>
      rounds.some(
        (r) => r.id === m.round_id && new Date(r.lock_time) <= now
      )
    )
    .map((m) => m.id);

  const { data: predsData } = lockedMatchIds.length
    ? await supabase
        .from("predictions")
        .select(
          "match_id, home_score_pred, away_score_pred, points_awarded"
        )
        .eq("user_id", userId)
        .in("match_id", lockedMatchIds)
    : { data: [] };

  const predMap = new Map(
    (predsData ?? []).map((p) => [p.match_id, p])
  );

  // Podio round
  const { data: podioRound } = await supabase
    .from("rounds")
    .select("lock_time")
    .eq("stage", "podio")
    .single();

  const podioLocked = podioRound
    ? new Date(podioRound.lock_time) <= now
    : false;

  // Podio prediction (RLS: own always visible; others only after lock)
  const { data: podioPred } = await supabase
    .from("podio_predictions")
    .select(
      `points_awarded,
       champion:teams!champion_team_id ( code, name_en, name_es, name_ko ),
       runner_up:teams!runner_up_team_id ( code, name_en, name_es, name_ko ),
       third_place:teams!third_place_team_id ( code, name_en, name_es, name_ko )`
    )
    .eq("user_id", userId)
    .maybeSingle();

  const matchPoints = (predsData ?? []).reduce(
    (sum, p) => sum + (p.points_awarded ?? 0),
    0
  );
  const podioPoints = podioPred?.points_awarded ?? 0;
  const totalPoints = matchPoints + (podioLocked ? podioPoints : 0);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${locale}/scoreboard`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {tScoreboard("backToScoreboard")}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{profile.display_name}</h1>
        {email && (
          <a
            href={`mailto:${email}`}
            className="block text-sm text-muted-foreground hover:text-foreground hover:underline break-all"
          >
            {email}
          </a>
        )}
        <p className="text-sm text-muted-foreground">
          {totalPoints} {tPred("pts")} total
        </p>
      </div>

      {/* Bonus Podium section */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold text-lg">{t("podiumSection")}</h2>
        {!podioLocked ? (
          <p className="text-sm text-muted-foreground">{t("podiumOpen")}</p>
        ) : podioPred ? (
          <div className="space-y-1.5">
            {(
              [
                {
                  label: t("champion"),
                  team: Array.isArray(podioPred.champion)
                    ? podioPred.champion[0]
                    : podioPred.champion,
                },
                {
                  label: t("runnerUp"),
                  team: Array.isArray(podioPred.runner_up)
                    ? podioPred.runner_up[0]
                    : podioPred.runner_up,
                },
                {
                  label: t("thirdPlace"),
                  team: Array.isArray(podioPred.third_place)
                    ? podioPred.third_place[0]
                    : podioPred.third_place,
                },
              ] as const
            ).map(({ label, team }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">
                  {label}
                </span>
                <span className="font-medium">
                  {teamName(team ?? null, locale)}
                </span>
              </div>
            ))}
            <p className="text-sm pt-1">
              <span className="text-muted-foreground">{t("podiumTotal")}: </span>
              <span className="font-bold text-primary">
                {podioPred.points_awarded ?? "—"} {tPred("pts")}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("podiumNone")}</p>
        )}
      </section>

      {/* All rounds */}
      {rounds.map((round) => {
        const isLocked = new Date(round.lock_time) <= now;
        const isCurrent = round.id === currentRoundId;
        const roundKey = round.name_key.replace(
          "rounds.",
          ""
        ) as Parameters<typeof tRounds>[0];

        const roundMatches = allMatches.filter(
          (m) => m.round_id === round.id
        );

        const roundPoints = roundMatches.reduce((sum, m) => {
          const p = predMap.get(m.id);
          return sum + (p?.points_awarded ?? 0);
        }, 0);

        return (
          <section key={round.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{tRounds(roundKey)}</h2>
              <span
                className="text-xs px-2 py-0.5 rounded-full border"
                style={
                  isLocked
                    ? { color: "#6b7280", borderColor: "#d1d5db" }
                    : isCurrent
                    ? { color: "#16a34a", borderColor: "#16a34a" }
                    : { color: "#9ca3af", borderColor: "#e5e7eb" }
                }
              >
                {isLocked
                  ? tPred("locked")
                  : isCurrent
                  ? t("currentRoundBadge")
                  : t("upcomingBadge")}
              </span>
              {isLocked && (
                <span className="ml-auto text-sm font-bold text-primary">
                  {roundPoints} {tPred("pts")}
                </span>
              )}
            </div>

            {isLocked ? (
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
                    {roundMatches.map((match) => {
                      const ht = Array.isArray(match.home_team)
                        ? match.home_team[0]
                        : match.home_team;
                      const at = Array.isArray(match.away_team)
                        ? match.away_team[0]
                        : match.away_team;
                      const pred = predMap.get(match.id);

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
            ) : (
              <p className="text-sm text-muted-foreground pl-1">
                {isCurrent ? t("currentRoundNote") : t("upcomingNote")}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
