import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DisplayNameEditor, type DisplayNameMode } from "@/components/profile/display-name-editor";
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

export default async function ProfilePage({ params }: Props) {
  const { locale, userId } = await params;
  const t = await getTranslations("profile");
  const tRounds = await getTranslations("rounds");
  const tPred = await getTranslations("predictions");
  const tScoreboard = await getTranslations("scoreboard");
  const supabase = await createClient();
  const now = new Date();

  const admin = createAdminClient();

  // Batch 1: profile, viewer identity, email lookup, rounds, matches, podio
  // data — all independent of each other
  const [
    { data: profile },
    {
      data: { user: viewer },
    },
    { data: authUser },
    { data: roundsData },
    { data: matchesData },
    { data: podioRound },
    { data: podioPred },
  ] = await Promise.all([
    // Target user's profile (include display_name_changed_at for editor-mode gating)
    supabase
      .from("profiles")
      .select("id, display_name, display_name_changed_at")
      .eq("id", userId)
      .single(),
    // Viewer identity — needed to decide which edit mode to show
    supabase.auth.getUser(),
    // Target user's email lives on auth.users, not profiles — read via admin client.
    admin.auth.admin.getUserById(userId),
    // All non-podio rounds
    supabase
      .from("rounds")
      .select("id, stage, name_key, order_index, lock_time")
      .neq("stage", "podio")
      .order("order_index", { ascending: true }),
    // All matches with teams
    supabase
      .from("matches")
      .select(
        `id, round_id, kickoff_at, status, home_score, away_score,
         penalty_winner_team_id, advancing_team_id,
         home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
         away_team:away_team_id ( id, code, name_en, name_es, name_ko )`
      )
      .order("kickoff_at", { ascending: true }),
    // Podio round
    supabase.from("rounds").select("lock_time").eq("stage", "podio").single(),
    // Podio prediction (RLS: own always visible; others only after lock)
    supabase
      .from("podio_predictions")
      .select(
        `points_awarded,
         champion:teams!champion_team_id ( code, name_en, name_es, name_ko ),
         runner_up:teams!runner_up_team_id ( code, name_en, name_es, name_ko ),
         third_place:teams!third_place_team_id ( code, name_en, name_es, name_ko )`
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!profile) notFound();

  const email = authUser?.user?.email ?? null;

  const rounds = roundsData ?? [];
  const allMatches = matchesData ?? [];

  // Classify rounds
  const unlockedRounds = rounds.filter((r) => new Date(r.lock_time) > now);
  const currentRoundId =
    unlockedRounds.length > 0 ? unlockedRounds[0]!.id : null;
  // rounds are ordered by order_index, so the last locked one is the most recent
  const lockedRounds = rounds.filter((r) => new Date(r.lock_time) <= now);
  const mostRecentLockedId =
    lockedRounds.length > 0 ? lockedRounds[lockedRounds.length - 1]!.id : null;

  // Predictions for locked rounds (RLS allows seeing others' predictions after lock)
  const lockedMatchIds = allMatches
    .filter((m) =>
      rounds.some((r) => r.id === m.round_id && new Date(r.lock_time) <= now)
    )
    .map((m) => m.id);

  const podioLocked = podioRound
    ? new Date(podioRound.lock_time) <= now
    : false;

  // Batch 2: viewerProfile (needs viewer.id) and predsData (needs lockedMatchIds)
  // are independent of each other
  const [{ data: viewerProfile }, { data: predsData }] = await Promise.all([
    viewer
      ? supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", viewer.id)
          .single()
      : Promise.resolve({ data: null }),
    lockedMatchIds.length
      ? supabase
          .from("predictions")
          .select(
            "match_id, home_score_pred, away_score_pred, penalty_winner_team_id, points_awarded"
          )
          .eq("user_id", userId)
          .in("match_id", lockedMatchIds)
      : Promise.resolve({
          data: [] as {
            match_id: string;
            home_score_pred: number;
            away_score_pred: number;
            penalty_winner_team_id: string | null;
            points_awarded: number | null;
          }[],
        }),
  ]);

  const isAdmin = viewerProfile?.is_admin ?? false;
  const isOwnProfile = viewer?.id === userId;

  // Admin → unlimited edits; own profile + allowance not used → one-time edit; else → static
  const editMode: DisplayNameMode = isAdmin
    ? "admin"
    : isOwnProfile && profile.display_name_changed_at == null
      ? "self-once"
      : "none";

  const predMap = new Map(
    (predsData ?? []).map((p) => [p.match_id, p])
  );

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
        <DisplayNameEditor
          userId={userId}
          initialName={profile.display_name}
          mode={editMode}
        />
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

      {/* All rounds (collapsible; the most recent locked round and the
          current one start open, older rounds start collapsed) */}
      {rounds.map((round) => {
        const isLocked = new Date(round.lock_time) <= now;
        const isCurrent = round.id === currentRoundId;
        const defaultOpen = isCurrent || round.id === mostRecentLockedId;
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
          <details key={round.id} open={defaultOpen} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
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
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {isLocked && (
                  <span className="text-sm font-bold text-primary">
                    {roundPoints} {tPred("pts")}
                  </span>
                )}
                <ChevronDown className="text-muted-foreground size-5 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
              </span>
            </summary>

            <div className="mt-2">
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
            ) : (
              <p className="text-sm text-muted-foreground pl-1">
                {isCurrent ? t("currentRoundNote") : t("upcomingNote")}
              </p>
            )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
