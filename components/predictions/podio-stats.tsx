export interface TeamStat {
  name: string;
  code: string;
  flag_url: string | null;
  count: number;
}

export interface TopTrio {
  champion: TeamStat;
  runnerUp: TeamStat;
  thirdPlace: TeamStat;
  count: number;
}

interface PlaceSection {
  medal: string;
  label: string;
  teams: TeamStat[];
  barColor: string;
}

interface PodioStatsProps {
  totalEntries: number;
  champion: TeamStat[];
  runnerUp: TeamStat[];
  thirdPlace: TeamStat[];
  onMostPodiums: TeamStat[];
  topTrio: TopTrio | null;
  labels: {
    statsTitle: string;
    statsEntries: string;
    statsChampion: string;
    statsRunnerUp: string;
    statsThirdPlace: string;
    statsOnMostPodiums: string;
    statsMostPopular: string;
  };
}

function TeamRow({
  team,
  maxCount,
  barColor,
}: {
  team: TeamStat;
  maxCount: number;
  barColor: string;
}) {
  const pct = maxCount > 0 ? (team.count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      {team.flag_url ? (
        <img
          src={team.flag_url}
          alt={team.code}
          className="h-4 w-6 shrink-0 rounded-[2px] object-cover"
        />
      ) : (
        <span className="w-6 shrink-0 text-center font-mono text-xs">
          {team.code}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.22 }}
        />
        <div className="relative flex items-center justify-between gap-2 px-1.5 py-0.5">
          <span className="truncate text-sm">{team.name}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            ×{team.count}
          </span>
        </div>
      </div>
    </div>
  );
}

function PlaceList({ section }: { section: PlaceSection }) {
  const maxCount = section.teams[0]?.count ?? 1;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {section.medal} {section.label}
      </p>
      <div className="space-y-1.5">
        {section.teams.map((team) => (
          <TeamRow
            key={team.code}
            team={team}
            maxCount={maxCount}
            barColor={section.barColor}
          />
        ))}
      </div>
    </div>
  );
}

export function PodioStats({
  totalEntries,
  champion,
  runnerUp,
  thirdPlace,
  onMostPodiums,
  topTrio,
  labels,
}: PodioStatsProps) {
  const sections: PlaceSection[] = [
    { medal: "🥇", label: labels.statsChampion, teams: champion, barColor: "#F4C430" },
    { medal: "🥈", label: labels.statsRunnerUp, teams: runnerUp, barColor: "#C0C0C0" },
    { medal: "🥉", label: labels.statsThirdPlace, teams: thirdPlace, barColor: "#CD7F32" },
  ];

  return (
    <div className="space-y-6 rounded-xl border p-5" style={{ backgroundColor: "rgba(244,196,48,0.04)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{labels.statsTitle}</h2>
        <span className="text-xs text-muted-foreground">{labels.statsEntries}</span>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <PlaceList key={section.label} section={section} />
        ))}
      </div>

      {onMostPodiums.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.statsOnMostPodiums}
          </p>
          <div className="space-y-1.5">
            {onMostPodiums.slice(0, 5).map((team) => (
              <TeamRow
                key={team.code}
                team={team}
                maxCount={onMostPodiums[0]?.count ?? 1}
                barColor="#F4C430"
              />
            ))}
          </div>
        </div>
      )}

      {topTrio && (
        <div
          className="rounded-lg border px-4 py-3"
          style={{
            backgroundColor: "rgba(244,196,48,0.08)",
            borderColor: "rgba(244,196,48,0.30)",
          }}
        >
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.statsMostPopular} — ×{topTrio.count}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm">🥇 {topTrio.champion.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm">🥈 {topTrio.runnerUp.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm">🥉 {topTrio.thirdPlace.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}
