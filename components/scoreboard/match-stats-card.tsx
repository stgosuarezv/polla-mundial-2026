"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  MatchPredictionSummary,
  OutcomeSummary,
  ScorelineGroup,
} from "@/lib/scoring/prediction-summary";

// ── types ──────────────────────────────────────────────────────────────────────

export interface MatchStatsItem {
  id: string;
  homeCode: string;
  awayCode: string;
  kickoffLabel: string;
  summary: MatchPredictionSummary;
}

// ── shared style helpers ───────────────────────────────────────────────────────

// Brand navy (#1A2855) tint — inline styles per the project's Tailwind-color
// caveat. Borders are black in light mode / white in dark mode.
const NAVY_TINT_BG = { backgroundColor: "rgba(26, 40, 85, 0.07)" };

export function useBoxBorder() {
  const { resolvedTheme } = useTheme();
  return { borderColor: resolvedTheme === "dark" ? "#ffffff" : "#000000" };
}

// ── sub-components ─────────────────────────────────────────────────────────────

function ScoreChip({ group }: { group: ScorelineGroup }) {
  const t = useTranslations("scoreboard");
  return (
    <Popover>
      <PopoverTrigger
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-sm transition-colors hover:border-foreground/30 hover:bg-muted/50"
        title={t("seeWhoPicked")}
        aria-label={`${group.home}–${group.away}: ${t("seeWhoPicked")}`}
      >
        <span className="font-medium tabular-nums">
          {group.home}–{group.away}
        </span>
        <span className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
          ×{group.count}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start">
        <p className="text-xs font-medium text-muted-foreground">
          {group.home}–{group.away} · ×{group.count}
        </p>
        <ul
          className="max-h-96 overflow-y-auto text-sm"
          onWheel={(e) => e.stopPropagation()}
        >
          {group.players.map((name) => (
            <li key={name} className="py-0.5">
              {name}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  const boxBorder = useBoxBorder();
  return (
    <div
      className="rounded-md border p-2 text-center"
      style={{ ...NAVY_TINT_BG, ...boxBorder }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums text-[#1A2855] dark:text-foreground">
        {value}
        {sub && (
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}

function OutcomeColumn({
  label,
  outcome,
}: {
  label: string;
  outcome: OutcomeSummary;
}) {
  const boxBorder = useBoxBorder();
  return (
    <div className="min-w-0">
      <div
        className="rounded-t-md border px-2 py-1.5 text-center"
        style={{ ...NAVY_TINT_BG, ...boxBorder }}
      >
        <span className="text-xs font-semibold text-[#1A2855] dark:text-foreground">
          {label}
        </span>
        <span className="ml-1.5 text-xs text-muted-foreground">
          {outcome.count}
        </span>
      </div>
      <div
        className="space-y-1 rounded-b-md border border-t-0 p-1.5"
        style={boxBorder}
      >
        {outcome.scores.length === 0 ? (
          <p className="py-1 text-center text-xs text-muted-foreground">—</p>
        ) : (
          outcome.scores.map((g) => (
            <ScoreChip key={`${g.home}-${g.away}`} group={g} />
          ))
        )}
      </div>
    </div>
  );
}

// ── MatchStatsCard ─────────────────────────────────────────────────────────────

/**
 * One bordered stat card for a single match: mode/avg stat boxes + three
 * outcome columns. Pass kickoffLabel to show the date/time header; omit it
 * when the context (e.g. a dialog header) already shows the match identity.
 */
export function MatchStatsCard({
  homeCode,
  awayCode,
  kickoffLabel,
  summary,
}: {
  homeCode: string;
  awayCode: string;
  kickoffLabel?: string;
  summary: MatchPredictionSummary;
}) {
  const t = useTranslations("scoreboard");

  return (
    <div className="rounded-lg border p-3">
      {kickoffLabel && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-[#1A2855] dark:text-foreground">
            {homeCode} – {awayCode}
          </span>
          <span className="text-xs text-muted-foreground">{kickoffLabel}</span>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <StatBox
          label={t("modeScore")}
          value={summary.mode.map((s) => `${s.home}–${s.away}`).join(" / ")}
          sub={`×${summary.mode[0]?.count ?? 0}`}
        />
        <StatBox
          label={t("avgPrediction")}
          value={`${summary.avgHome.toFixed(1)} – ${summary.avgAway.toFixed(1)}`}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <OutcomeColumn label={homeCode} outcome={summary.homeWin} />
        <OutcomeColumn label={t("draw")} outcome={summary.draw} />
        <OutcomeColumn label={awayCode} outcome={summary.awayWin} />
      </div>
    </div>
  );
}

// ── MatchStatsGrid ─────────────────────────────────────────────────────────────

/**
 * Centered responsive grid of MatchStatsCard. Single item → max-w-xl centered;
 * two items → md:grid-cols-2 max-w-4xl (matching the old NextMatchSummary layout).
 */
export function MatchStatsGrid({ items }: { items: MatchStatsItem[] }) {
  return (
    <div
      className={
        items.length > 1
          ? "mx-auto grid max-w-4xl gap-4 md:grid-cols-2"
          : "mx-auto max-w-xl"
      }
    >
      {items.map((m) => (
        <MatchStatsCard
          key={m.id}
          homeCode={m.homeCode}
          awayCode={m.awayCode}
          kickoffLabel={m.kickoffLabel}
          summary={m.summary}
        />
      ))}
    </div>
  );
}
