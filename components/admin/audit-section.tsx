import { getTranslations } from "next-intl/server";

interface AuditMatch {
  home_team: { code: string }[] | null;
  away_team: { code: string }[] | null;
}

interface MatchAuditEntry {
  id: string;
  changed_at: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  match: AuditMatch | AuditMatch[] | null;
  changer: { display_name: string } | { display_name: string }[] | null;
}

interface RoundAuditEntry {
  id: string;
  changed_at: string;
  old_value: { lock_time: string } | null;
  new_value: { lock_time: string } | null;
  round: { name_key: string } | { name_key: string }[] | null;
  changer: { display_name: string } | { display_name: string }[] | null;
}

interface Props {
  matchEntries: MatchAuditEntry[];
  roundEntries: RoundAuditEntry[];
}

function getCode(t: { code: string }[] | null | undefined): string {
  return t?.[0]?.code ?? "?";
}

function getName(
  t: { display_name: string } | { display_name: string }[] | null
): string {
  if (!t) return "?";
  return Array.isArray(t) ? (t[0]?.display_name ?? "?") : t.display_name;
}

function resolveMatch(m: AuditMatch | AuditMatch[] | null): AuditMatch | null {
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

function getRoundNameKey(
  r: { name_key: string } | { name_key: string }[] | null
): string {
  if (!r) return "";
  const row = Array.isArray(r) ? r[0] : r;
  return row?.name_key ?? "";
}

function diffLabel(
  old_: Record<string, unknown> | null,
  new_: Record<string, unknown> | null
): string {
  const parts: string[] = [];
  const keys = ["status", "home_score", "away_score", "penalty_winner_team_id"];
  for (const k of keys) {
    const ov = old_?.[k];
    const nv = new_?.[k];
    if (ov !== nv) {
      const label = k.replace(/_/g, " ");
      parts.push(`${label}: ${ov ?? "—"} → ${nv ?? "—"}`);
    }
  }
  return parts.join(", ") || "no changes";
}

function formatTs(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function AuditSection({ matchEntries, roundEntries }: Props) {
  const t = await getTranslations("admin.audit");
  const tRounds = await getTranslations("rounds");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 font-semibold">{t("title")}</h2>
        {matchEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changedAt")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changedBy")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("match")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changes")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {matchEntries.map((entry) => {
                  const m = resolveMatch(entry.match);
                  const ht = getCode(m?.home_team ?? null);
                  const at = getCode(m?.away_team ?? null);
                  const changer = getName(entry.changer);
                  const changes = diffLabel(entry.old_value, entry.new_value);

                  return (
                    <tr key={entry.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium">{changer}</td>
                      <td className="px-3 py-2">
                        {ht} vs {at}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {changes}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">{t("roundChangesTitle")}</h2>
        {roundEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("roundEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changedAt")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changedBy")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("round")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("changes")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roundEntries.map((entry) => {
                  const nameKey = getRoundNameKey(entry.round);
                  const roundKey = nameKey.replace(
                    "rounds.",
                    ""
                  ) as Parameters<typeof tRounds>[0];
                  const roundName = roundKey ? tRounds(roundKey) : nameKey;
                  const changer = getName(entry.changer);
                  const changeStr = `${t("deadlineChange")}: ${formatTs(entry.old_value?.lock_time)} → ${formatTs(entry.new_value?.lock_time)}`;

                  return (
                    <tr key={entry.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium">{changer}</td>
                      <td className="px-3 py-2">{roundName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {changeStr}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
