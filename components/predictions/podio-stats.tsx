"use client";

import { useState } from "react";
import { domToBlob } from "modern-screenshot";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface TeamStat {
  name: string;
  code: string;
  flag_url: string | null;
  count: number;
  players: string[];
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
    downloadPng: string;
    downloadPdf: string;
    seeWhoPicked: string;
  };
}

// iOS Safari silently crops canvases past ~16.7M pixels
const MAX_CANVAS_AREA = 16_000_000;

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function TeamRow({
  team,
  maxCount,
  barColor,
  seeWhoPicked,
}: {
  team: TeamStat;
  maxCount: number;
  barColor: string;
  seeWhoPicked: string;
}) {
  const pct = maxCount > 0 ? (team.count / maxCount) * 100 : 0;

  const rowContent = (
    <>
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
          <span
            className="shrink-0 font-mono text-xs text-muted-foreground"
            style={
              team.players.length > 0
                ? { textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }
                : undefined
            }
          >
            ×{team.count}
          </span>
        </div>
      </div>
    </>
  );

  if (team.players.length === 0) {
    return <div className="flex items-center gap-2">{rowContent}</div>;
  }

  return (
    <Popover>
      <PopoverTrigger
        className="flex w-full cursor-pointer items-center gap-2 rounded transition-colors hover:bg-muted/40"
        title={seeWhoPicked}
        aria-label={`${team.name}: ${seeWhoPicked}`}
      >
        {rowContent}
      </PopoverTrigger>
      <PopoverContent
        className="flex w-48 flex-col overflow-hidden"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        align="start"
      >
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {team.name} · ×{team.count}
        </p>
        <ul
          className="mt-1 min-h-0 flex-1 overflow-y-auto text-sm"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {team.players.map((name) => (
            <li key={name} className="py-0.5">
              {name}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function PlaceList({
  section,
  seeWhoPicked,
}: {
  section: PlaceSection;
  seeWhoPicked: string;
}) {
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
            seeWhoPicked={seeWhoPicked}
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
  const [busy, setBusy] = useState(false);

  const sections: PlaceSection[] = [
    { medal: "🥇", label: labels.statsChampion, teams: champion, barColor: "#F4C430" },
    { medal: "🥈", label: labels.statsRunnerUp, teams: runnerUp, barColor: "#C0C0C0" },
    { medal: "🥉", label: labels.statsThirdPlace, teams: thirdPlace, barColor: "#CD7F32" },
  ];

  async function handleDownloadPng() {
    const el = document.getElementById("podio-stats");
    if (!el) return;
    setBusy(true);
    try {
      const scale = Math.min(
        2,
        Math.sqrt(MAX_CANVAS_AREA / (el.scrollWidth * el.scrollHeight))
      );
      const blob = await domToBlob(el, {
        scale,
        width: el.scrollWidth,
        height: el.scrollHeight,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      if (!blob) return;
      const file = new File([blob], "podio-stats.png", { type: "image/png" });
      if (isMobile() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "podio-stats.png";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Download buttons — outside the capture target */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPng}
          disabled={busy}
        >
          {labels.downloadPng}
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          {labels.downloadPdf}
        </Button>
      </div>

      {/* Stats card — this element is captured for PNG */}
      <div
        id="podio-stats"
        className="space-y-6 rounded-xl border p-5"
        style={{ backgroundColor: "rgba(244,196,48,0.04)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">{labels.statsTitle}</h2>
          <span className="text-xs text-muted-foreground">
            {labels.statsEntries}
          </span>
        </div>

        <div className="space-y-5">
          {sections.map((section) => (
            <PlaceList
              key={section.label}
              section={section}
              seeWhoPicked={labels.seeWhoPicked}
            />
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
                  seeWhoPicked={labels.seeWhoPicked}
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
    </div>
  );
}
