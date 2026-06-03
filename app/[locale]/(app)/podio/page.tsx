import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PodioPicker } from "@/components/predictions/podio-picker";
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

  const { data: podioRound } = await supabase
    .from("rounds")
    .select("lock_time")
    .eq("stage", "podio")
    .single();

  const isLocked = podioRound ? podioRound.lock_time <= now : false;

  const { data: teamsRaw } = await supabase
    .from("teams")
    .select("id, code, name_en, name_es, name_ko, flag_url")
    .order("name_en", { ascending: true });

  const teams = (teamsRaw ?? []).map((team) => ({
    id: team.id,
    code: team.code,
    name: teamName(team, locale),
    flag_url: team.flag_url,
  }));

  // Reads from the my_podio_prediction view (security_invoker, filters by
  // auth.uid()) so this query can NEVER return another user's row — important
  // here because podio_predictions' RLS exposes others' rows once the Podio
  // window locks, and .maybeSingle() would otherwise throw or pick an arbitrary
  // row. See CLAUDE.md "User-data queries".
  const { data: existing } = await supabase
    .from("my_podio_prediction")
    .select(
      "champion_team_id, runner_up_team_id, third_place_team_id, points_awarded"
    )
    .maybeSingle();

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
    </div>
  );
}
