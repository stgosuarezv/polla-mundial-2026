"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankHistorySeries } from "@/lib/scoring/rank-history";

interface TrajectorySectionProps {
  series: RankHistorySeries[];
  /** One `rounds.*` name_key per step, aligned with each series' ranks[]. */
  stepKeys: string[];
  currentUserId: string | null;
  playerCount: number;
}

// Always-dark "race board" palette (FWC26). Fixed in both themes on purpose,
// like the navbar/emblem pill — the board is a dark surface in light mode too.
const NAVY = "#1A2855";
const NAVY_DEEP = "#141F44";
const CREAM = "#F5F0E6";
const GOLD = "#F4C430";
const GOLD_LIGHT = "#F8DD8A";
const SUCCESS = "#1EA64F";
const DANGER = "#E10F1E";
const OTHER_HUES = [
  "#7C8AB0",
  "#5E7BBF",
  "#8E7BC4",
  "#B07BA8",
  "#6FA0B8",
  "#9AA7C9",
  "#6E84C0",
  "#A88BC0",
];

const SHORT_LABEL: Record<string, string> = {
  group_1: "G1",
  group_2: "G2",
  group_3: "G3",
  podio: "Pod",
  knockout_r32: "R32",
  knockout_r16: "R16",
  knockout_qf: "QF",
  knockout_sf: "SF",
  knockout_3rd: "3º",
  knockout_final: "Fin",
};

// ── Plot geometry (viewBox units; SVG scales to container width) ──────────────
const VBW = 720;
const VBH = 440;
const PLOT_LEFT = 116;
const PLOT_RIGHT = 648;
const PLOT_TOP = 122;
const PLOT_BOTTOM = 384;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function finalRank(s: RankHistorySeries): number {
  return s.ranks.length ? s.ranks[s.ranks.length - 1]! : Infinity;
}

export function TrajectorySection({
  series,
  stepKeys,
  currentUserId,
  playerCount,
}: TrajectorySectionProps) {
  const t = useTranslations("scoreboard");
  const [open, setOpen] = useState(true);

  const nSteps = stepKeys.length;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h2 className="dark:text-foreground text-lg font-bold text-[#1A2855]">
          {t("trajectoryTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("trajectorySubtitle")}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? t("trajectoryHide") : t("trajectoryShow")}
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
    </div>
  );

  // Need at least two rounds played to draw a trajectory.
  if (nSteps < 2) {
    return (
      <section className="space-y-3 print:hidden">
        {header}
        {open && (
          <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-6 text-center text-sm">
            {t("trajectoryEmpty")}
          </div>
        )}
      </section>
    );
  }

  // Top 8 by current (final) rank, plus the logged-in user if they fall outside.
  const sorted = [...series].sort((a, b) => finalRank(a) - finalRank(b));
  const top = sorted.slice(0, 8);
  const me = currentUserId
    ? (series.find((s) => s.userId === currentUserId) ?? null)
    : null;
  const displayed =
    me && !top.some((s) => s.userId === me.userId) ? [...top, me] : top;
  const others = displayed.filter((s) => s.userId !== me?.userId);

  const domainMax = Math.max(2, ...displayed.flatMap((s) => s.ranks));

  const xFor = (i: number) =>
    PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * i) / (nSteps - 1);
  const yFor = (rank: number) =>
    PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * (rank - 1)) / (domainMax - 1);

  const pointsOf = (s: RankHistorySeries) =>
    s.ranks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");

  // Rank labels: 1, then every 5th up to the domain max, plus the max itself.
  const rankLabels = new Set<number>([1, domainMax]);
  for (let r = 5; r < domainMax; r += 5) rankLabels.add(r);

  // "Me" rank change over the most recent round (negative rank delta = climbed).
  let meDelta = 0;
  if (me && me.ranks.length >= 2) {
    meDelta = me.ranks[me.ranks.length - 2]! - me.ranks[me.ranks.length - 1]!;
  }

  return (
    <section className="space-y-3 print:hidden">
      {header}
      {open && (
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          width="100%"
          role="img"
          style={{ display: "block" }}
        >
          <title>{t("trajectoryTitle")}</title>
          <desc>{t("trajectoryAria")}</desc>

          <defs>
            <linearGradient id="trajBoard" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={NAVY} />
              <stop offset="1" stopColor={NAVY_DEEP} />
            </linearGradient>
            <linearGradient id="trajMe" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={GOLD} />
              <stop offset="1" stopColor={GOLD_LIGHT} />
            </linearGradient>
          </defs>

          <rect
            x="0"
            y="0"
            width={VBW}
            height={VBH}
            rx="16"
            fill="url(#trajBoard)"
          />
          <rect
            x="0.5"
            y="0.5"
            width={VBW - 1}
            height={VBH - 1}
            rx="16"
            fill="none"
            stroke={GOLD}
            strokeOpacity="0.3"
          />

          <text x="28" y="42" fill={CREAM} fontSize="19" fontWeight="700">
            {t("trajectoryTitle")}
          </text>
          <text x="28" y="62" fill={CREAM} fillOpacity="0.55" fontSize="12.5">
            {t("trajectorySubtitle")}
          </text>

          {/* Round headers + vertical ticks */}
          {stepKeys.map((key, i) => (
            <g key={`step-${i}`}>
              <line
                x1={xFor(i)}
                y1={PLOT_TOP - 8}
                x2={xFor(i)}
                y2={PLOT_BOTTOM + 8}
                stroke={CREAM}
                strokeOpacity="0.05"
              />
              <text
                x={xFor(i)}
                y={PLOT_TOP - 18}
                fill={i === nSteps - 1 ? GOLD : CREAM}
                fillOpacity={i === nSteps - 1 ? 1 : 0.7}
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
              >
                {SHORT_LABEL[key] ?? key}
              </text>
            </g>
          ))}

          {/* Rank lanes + gutter labels */}
          {[...rankLabels]
            .sort((a, b) => a - b)
            .map((r) => (
              <g key={`rank-${r}`}>
                <line
                  x1={PLOT_LEFT - 8}
                  y1={yFor(r)}
                  x2={PLOT_RIGHT + 8}
                  y2={yFor(r)}
                  stroke={CREAM}
                  strokeOpacity="0.07"
                />
                <text
                  x={PLOT_LEFT - 22}
                  y={yFor(r) + 4}
                  fill={CREAM}
                  fillOpacity="0.45"
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="end"
                >
                  {r}º
                </text>
              </g>
            ))}

          {/* Other players (faded) */}
          {others.map((s, idx) => {
            const hue = OTHER_HUES[idx % OTHER_HUES.length]!;
            const ey = yFor(s.ranks[s.ranks.length - 1]!);
            return (
              <g key={s.userId}>
                <polyline
                  points={pointsOf(s)}
                  fill="none"
                  stroke={hue}
                  strokeWidth="3"
                  strokeOpacity="0.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={xFor(nSteps - 1)}
                  cy={ey}
                  r="12"
                  fill={NAVY_DEEP}
                  stroke={hue}
                  strokeWidth="2.5"
                />
                <text
                  x={xFor(nSteps - 1)}
                  y={ey + 4}
                  fill="#C6CFE6"
                  fontSize="10.5"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {initials(s.displayName)}
                </text>
              </g>
            );
          })}

          {/* Me (gold, on top) */}
          {me && (
            <g>
              <polyline
                points={pointsOf(me)}
                fill="none"
                stroke={GOLD}
                strokeWidth="9"
                strokeOpacity="0.18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={pointsOf(me)}
                fill="none"
                stroke="url(#trajMe)"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {me.ranks.slice(0, -1).map((r, i) => (
                <circle
                  key={`me-wp-${i}`}
                  cx={xFor(i)}
                  cy={yFor(r)}
                  r="4.5"
                  fill={NAVY}
                  stroke={GOLD_LIGHT}
                  strokeWidth="2.5"
                />
              ))}
              <circle
                cx={xFor(nSteps - 1)}
                cy={yFor(me.ranks[me.ranks.length - 1]!)}
                r="18"
                fill={GOLD}
              />
              <circle
                cx={xFor(nSteps - 1)}
                cy={yFor(me.ranks[me.ranks.length - 1]!)}
                r="18"
                fill="none"
                stroke={CREAM}
                strokeWidth="2"
              />
              <text
                x={xFor(nSteps - 1)}
                y={yFor(me.ranks[me.ranks.length - 1]!) + 5}
                fill={NAVY}
                fontSize="13"
                fontWeight="800"
                textAnchor="middle"
              >
                {t("trajectoryYou")}
              </text>
              {meDelta !== 0 && (
                <g
                  transform={`translate(${xFor(nSteps - 1) + 22}, ${
                    yFor(me.ranks[me.ranks.length - 1]!) - 26
                  })`}
                >
                  <rect
                    x="0"
                    y="0"
                    width="36"
                    height="20"
                    rx="10"
                    fill={meDelta > 0 ? SUCCESS : DANGER}
                  />
                  <path
                    d={meDelta > 0 ? "M9 14 l4 -5 l4 5" : "M9 9 l4 5 l4 -5"}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text
                    x="25"
                    y="14.5"
                    fill="#FFFFFF"
                    fontSize="11.5"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {Math.abs(meDelta)}
                  </text>
                </g>
              )}
            </g>
          )}

          {/* Legend */}
          <g fontSize="11.5">
            <line
              x1="28"
              y1="414"
              x2="54"
              y2="414"
              stroke="url(#trajMe)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <text x="60" y="418" fill={CREAM} fontWeight="700">
              {t("trajectoryYou")}
            </text>
            <line
              x1="100"
              y1="414"
              x2="126"
              y2="414"
              stroke={OTHER_HUES[0]}
              strokeWidth="3"
              strokeOpacity="0.6"
              strokeLinecap="round"
            />
            <text x="132" y="418" fill={CREAM} fillOpacity="0.7">
              {t("trajectoryOthers")}
            </text>
          </g>
        </svg>
      )}
      <p className="text-muted-foreground text-xs">
        {t("trajectoryFootnote", { count: playerCount })}
      </p>
    </section>
  );
}
