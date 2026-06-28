import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PodioPicker } from "@/components/predictions/podio-picker";
import { PodioStats, type TeamStat, type TopTrio } from "@/components/predictions/podio-stats";
import { Countdown } from "@/components/countdown";

interface Props {
  params: Promise<{ locale: string }>;
}

function teamName(
  team: { name_en: string; name_es: string; name_ko: string },
  locale: string
) {
  if (locale === "ko") return team.name_ko;
  if (locale === "en") return team.name_en;
  return team.name_es;
}

export default async function PodioPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("podio");
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Reads from the my_podio_prediction view (security_invoker, filters by
  // auth.uid()) so this query can NEVER return another user's row — important
  // here because podio_predictions' RLS exposes others' rows once the Podio
  // window locks, and .maybeSingle() would otherwise throw or pick an arbitrary
  // row. See CLAUDE.md "User-data queries".
  //
  // allPodios is a deliberate cross-user read: RLS returns all rows only after
  // the podio round locks. Pre-lock it returns only the caller's own row; we
  // only use the data when isLocked is true.
  const [
    { data: podioRound },
    { data: teamsRaw },
    { data: existing },
    { data: allPodiosRaw },
    { data: profilesRaw },
  ] = await Promise.all([
    supabase.from("rounds").select("lock_time").eq("stage", "podio").single(),
    supabase
      .from("teams")
      .select("id, code, name_en, name_es, name_ko, flag_url")
      .order("name_en", { ascending: true }),
    supabase
      .from("my_podio_prediction")
      .select(
        "champion_team_id, runner_up_team_id, third_place_team_id, points_awarded"
      )
      .maybeSingle(),
    supabase
      .from("podio_predictions")
      .select("user_id, champion_team_id, runner_up_team_id, third_place_team_id"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const isLocked = podioRound ? podioRound.lock_time <= now : false;

  const teams = (teamsRaw ?? []).map((team) => ({
    id: team.id,
    code: team.code,
    name: teamName(team, locale),
    flag_url: team.flag_url,
  }));

  // Compute stats for post-lock display
  type PodioRow = {
    user_id: string;
    champion_team_id: string | null;
    runner_up_team_id: string | null;
    third_place_team_id: string | null;
  };

  let podioStats: {
    totalEntries: number;
    champion: TeamStat[];
    runnerUp: TeamStat[];
    thirdPlace: TeamStat[];
    onMostPodiums: TeamStat[];
    topTrio: TopTrio | null;
  } | null = null;

  if (isLocked) {
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const nameById = new Map(
      (profilesRaw ?? []).map((p) => [p.id, p.display_name as string])
    );

    const completePodiums = ((allPodiosRaw ?? []) as PodioRow[]).filter(
      (r) => r.champion_team_id && r.runner_up_team_id && r.third_place_team_id
    );
    const totalEntries = completePodiums.length;

    if (totalEntries > 0) {
      function rankByCount(
        pairs: Array<{ teamId: string | null; playerName: string }>
      ): TeamStat[] {
        const counts = new Map<string, number>();
        const playersByTeam = new Map<string, string[]>();
        for (const { teamId, playerName } of pairs) {
          if (!teamId) continue;
          counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
          const list = playersByTeam.get(teamId) ?? [];
          list.push(playerName);
          playersByTeam.set(teamId, list);
        }
        return [...counts.entries()]
          .sort((a, b) => {
            const diff = b[1] - a[1];
            if (diff !== 0) return diff;
            return (teamById.get(a[0])?.name ?? "").localeCompare(
              teamById.get(b[0])?.name ?? ""
            );
          })
          .map(([teamId, count]) => {
            const team = teamById.get(teamId);
            return {
              name: team?.name ?? teamId,
              code: team?.code ?? teamId,
              flag_url: team?.flag_url ?? null,
              count,
              players: playersByTeam.get(teamId) ?? [],
            };
          });
      }

      const toPairs = (rows: PodioRow[], pick: (r: PodioRow) => string | null) =>
        rows.map((r) => ({
          teamId: pick(r),
          playerName: nameById.get(r.user_id) ?? r.user_id,
        }));

      const champion = rankByCount(toPairs(completePodiums, (r) => r.champion_team_id));
      const runnerUp = rankByCount(toPairs(completePodiums, (r) => r.runner_up_team_id));
      const thirdPlace = rankByCount(toPairs(completePodiums, (r) => r.third_place_team_id));
      const onMostPodiums = rankByCount(
        completePodiums.flatMap((r) => {
          const name = nameById.get(r.user_id) ?? r.user_id;
          return [
            { teamId: r.champion_team_id, playerName: name },
            { teamId: r.runner_up_team_id, playerName: name },
            { teamId: r.third_place_team_id, playerName: name },
          ];
        })
      );

      // Most common exact 1-2-3 combination (show only when count ≥ 2)
      let topTrio: TopTrio | null = null;
      const trioCounts = new Map<string, number>();
      for (const r of completePodiums) {
        const key = `${r.champion_team_id}|${r.runner_up_team_id}|${r.third_place_team_id}`;
        trioCounts.set(key, (trioCounts.get(key) ?? 0) + 1);
      }
      const best = [...trioCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) {
        const [champId, ruId, tpId] = best[0].split("|");
        const champTeam = champId ? teamById.get(champId) : undefined;
        const ruTeam = ruId ? teamById.get(ruId) : undefined;
        const tpTeam = tpId ? teamById.get(tpId) : undefined;
        if (champTeam && ruTeam && tpTeam) {
          topTrio = {
            champion: { ...champTeam, count: best[1], players: [] },
            runnerUp: { ...ruTeam, count: best[1], players: [] },
            thirdPlace: { ...tpTeam, count: best[1], players: [] },
            count: best[1],
          };
        }
      }

      podioStats = { totalEntries, champion, runnerUp, thirdPlace, onMostPodiums, topTrio };
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {podioRound && !isLocked && (
        <Countdown
          lockTime={podioRound.lock_time}
          roundName={t("title")}
          label="Cierra en"
        />
      )}

      {isLocked && !existing ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("locked")}
        </p>
      ) : (
        <PodioPicker
          teams={teams}
          existing={existing ?? null}
          isLocked={isLocked}
          t={{
            champion: t("champion"),
            runnerUp: t("runnerUp"),
            thirdPlace: t("thirdPlace"),
            save: t("save"),
            saving: t("saving"),
            saved: t("saved"),
            selectTeam: t("selectTeam"),
            mustBeDistinct: t("mustBeDistinct"),
            errorSaving: t("errorSaving"),
            pts: t("pts"),
          }}
        />
      )}

      {existing?.points_awarded != null && (
        <p className="text-center text-lg font-bold text-green-600">
          {existing.points_awarded} {t("pts")}
        </p>
      )}

      {podioStats && (
        <PodioStats
          totalEntries={podioStats.totalEntries}
          champion={podioStats.champion}
          runnerUp={podioStats.runnerUp}
          thirdPlace={podioStats.thirdPlace}
          onMostPodiums={podioStats.onMostPodiums}
          topTrio={podioStats.topTrio}
          labels={{
            statsTitle: t("statsTitle"),
            statsEntries: t("statsEntries", { count: podioStats.totalEntries }),
            statsChampion: t("champion"),
            statsRunnerUp: t("runnerUp"),
            statsThirdPlace: t("thirdPlace"),
            statsOnMostPodiums: t("statsOnMostPodiums"),
            statsMostPopular: t("statsMostPopular"),
            downloadPng: t("downloadPng"),
            downloadPdf: t("downloadPdf"),
            seeWhoPicked: t("seeWhoPicked"),
          }}
        />
      )}
    </div>
  );
}
