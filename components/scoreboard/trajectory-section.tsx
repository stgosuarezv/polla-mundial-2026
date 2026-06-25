"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankHistorySeries } from "@/lib/scoring/rank-history";

interface TrajectorySectionProps {
  series: RankHistorySeries[];
  /** One team-code label per match step ("BRA-CRO"), aligned with each
   *  series' ranks[]. */
  stepLabels: string[];
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
const OTHER_FALLBACK = "#7C8AB0";

// ── Plot geometry (pixel values; horizontal scroll) ────────────────────────
const GUTTER_W = 56;   // width of the fixed rank-label sidebar
const VBH = 400;       // total SVG height for both gutter and plot
const PLOT_TOP = 72;   // y of rank-1 gridline
const PLOT_BOTTOM = 360; // y of domainMax gridline
const STEP_W = 46;     // px between consecutive match steps
const PAD_L = 24;      // left padding inside the scrollable SVG
const PAD_R = 64;      // right padding (room for end dot + initials)

/** HSL color for a player by sorted index; gold for the current user. */
function playerColor(index: number, isMe: boolean): string {
  if (isMe) return GOLD;
  return `hsl(${(index * 47) % 360}, 55%, 64%)`;
}

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
  stepLabels,
  currentUserId,
  playerCount,
}: TrajectorySectionProps) {
  const t = useTranslations("scoreboard");

  const [open, setOpen] = useState(true);
  // Default: all players selected.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(series.map((s) => s.userId))
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nSteps = stepLabels.length;

  // Sort series by final rank (ascending); stable sort keeps equal ranks in
  // original order, which matches the live leaderboard tie ordering.
  const sorted = useMemo(
    () => [...series].sort((a, b) => finalRank(a) - finalRank(b)),
    [series]
  );

  // Stable color per player keyed by sorted index.
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sorted.forEach((s, i) => {
      map.set(s.userId, playerColor(i, s.userId === currentUserId));
    });
    return map;
  }, [sorted, currentUserId]);

  // Geometry ─────────────────────────────────────────────────────────────────
  const plotW = Math.max(640, PAD_L + (nSteps - 1) * STEP_W + PAD_R);

  const xFor = (i: number) => PAD_L + i * STEP_W;

  // domainMax from currently-selected series so the axis zooms to the view.
  const selectedSeries = useMemo(
    () => sorted.filter((s) => selected.has(s.userId)),
    [sorted, selected]
  );

  const domainMax = useMemo(() => {
    if (selectedSeries.length === 0) return 2;
    return Math.max(2, ...selectedSeries.flatMap((s) => s.ranks));
  }, [selectedSeries]);

  const yFor = (rank: number) =>
    PLOT_TOP +
    ((PLOT_BOTTOM - PLOT_TOP) * (rank - 1)) / Math.max(1, domainMax - 1);

  const rankLabels = useMemo(() => {
    const labels = new Set<number>([1, domainMax]);
    for (let r = 5; r < domainMax; r += 5) labels.add(r);
    return [...labels].sort((a, b) => a - b);
  }, [domainMax]);

  // Preset handlers ───────────────────────────────────────────────────────────
  const selectAll = () => setSelected(new Set(series.map((s) => s.userId)));
  const selectNone = () => setSelected(new Set());
  const selectTop = (n: number) =>
    setSelected(new Set(sorted.slice(0, n).map((s) => s.userId)));
  const togglePlayer = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  // ── Header (always rendered) ───────────────────────────────────────────────
  const header = (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h2 className="dark:text-foreground text-lg font-bold text-[#1A2855]">
          {t("trajectoryTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("trajectorySubtitle")}</p>
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

  // Guard: need at least two match steps to draw a trajectory.
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

  // "Me" rank-delta over the last match step.
  const meSeries = currentUserId
    ? (series.find((s) => s.userId === currentUserId) ?? null)
    : null;
  let meDelta = 0;
  if (meSeries && meSeries.ranks.length >= 2) {
    meDelta =
      meSeries.ranks[meSeries.ranks.length - 2]! -
      meSeries.ranks[meSeries.ranks.length - 1]!;
  }

  // ── Shared SVG defs id ────────────────────────────────────────────────────
  const gradId = "trajMe";

  return (
    <section className="space-y-3 print:hidden">
      {header}
      {open && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* ── Chart area ─────────────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            <div
              style={{
                background: NAVY_DEEP,
                borderRadius: 12,
                border: `1px solid ${GOLD}33`,
                padding: "14px 0 12px 0",
              }}
            >
              {/* Board title */}
              <div style={{ padding: "0 16px 10px 16px" }}>
                <p
                  style={{ color: CREAM, fontSize: 15, fontWeight: 700 }}
                >
                  {t("trajectoryTitle")}
                </p>
                <p
                  style={{
                    color: CREAM,
                    opacity: 0.55,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {t("trajectorySubtitle")}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start" }}>
                {/* Fixed rank-gutter SVG */}
                <svg
                  width={GUTTER_W}
                  height={VBH}
                  style={{ flexShrink: 0 }}
                  aria-hidden="true"
                >
                  {rankLabels.map((r) => (
                    <text
                      key={r}
                      x={GUTTER_W - 8}
                      y={yFor(r) + 4}
                      fill={CREAM}
                      fillOpacity="0.5"
                      fontSize="11"
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {r}º
                    </text>
                  ))}
                </svg>

                {/* Horizontally scrollable plot */}
                <div style={{ overflowX: "auto", flexGrow: 1 }}>
                  <svg
                    width={plotW}
                    height={VBH}
                    role="img"
                    style={{ display: "block" }}
                  >
                    <title>{t("trajectoryTitle")}</title>
                    <desc>{t("trajectoryAria")}</desc>

                    <defs>
                      <linearGradient
                        id={gradId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop offset="0" stopColor={GOLD} />
                        <stop offset="1" stopColor={GOLD_LIGHT} />
                      </linearGradient>
                    </defs>

                    {/* Horizontal rank gridlines */}
                    {rankLabels.map((r) => (
                      <line
                        key={`rl-${r}`}
                        x1={0}
                        y1={yFor(r)}
                        x2={plotW}
                        y2={yFor(r)}
                        stroke={CREAM}
                        strokeOpacity="0.06"
                      />
                    ))}

                    {/* Per-match vertical ticks + rotated team-code labels */}
                    {stepLabels.map((label, i) => {
                      const x = xFor(i);
                      const isLast = i === nSteps - 1;
                      return (
                        <g key={`step-${i}`}>
                          <line
                            x1={x}
                            y1={PLOT_TOP - 8}
                            x2={x}
                            y2={PLOT_BOTTOM + 8}
                            stroke={CREAM}
                            strokeOpacity="0.05"
                          />
                          <text
                            x={x}
                            y={PLOT_TOP - 14}
                            fill={isLast ? GOLD : CREAM}
                            fillOpacity={isLast ? 1 : 0.6}
                            fontSize="9"
                            fontWeight={isLast ? "700" : "500"}
                            textAnchor="end"
                            transform={`rotate(-50, ${x}, ${PLOT_TOP - 14})`}
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Other-player lines (selected, non-me) */}
                    {selectedSeries
                      .filter((s) => s.userId !== currentUserId)
                      .map((s) => {
                        const color =
                          colorMap.get(s.userId) ?? OTHER_FALLBACK;
                        const isHovered = hoveredId === s.userId;
                        const isDimmed =
                          hoveredId !== null && !isHovered;
                        const points = s.ranks
                          .map((r, i) => `${xFor(i)},${yFor(r)}`)
                          .join(" ");
                        const lastRank = s.ranks[nSteps - 1];
                        return (
                          <g key={s.userId}>
                            <polyline
                              points={points}
                              fill="none"
                              stroke={color}
                              strokeWidth={isHovered ? 3.5 : 2}
                              strokeOpacity={
                                isDimmed ? 0.12 : isHovered ? 1 : 0.55
                              }
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <title>{s.displayName}</title>
                            </polyline>
                            {lastRank !== undefined && (
                              <circle
                                cx={xFor(nSteps - 1)}
                                cy={yFor(lastRank)}
                                r={isHovered ? 5 : 3}
                                fill={color}
                                fillOpacity={isDimmed ? 0.15 : 1}
                              />
                            )}
                            {/* Initials label when few lines are shown */}
                            {selected.size <= 12 &&
                              lastRank !== undefined && (
                                <text
                                  x={xFor(nSteps - 1) + 8}
                                  y={yFor(lastRank) + 4}
                                  fill={color}
                                  fillOpacity={isDimmed ? 0.15 : 0.85}
                                  fontSize="9"
                                  fontWeight="600"
                                >
                                  {initials(s.displayName)}
                                </text>
                              )}
                          </g>
                        );
                      })}

                    {/* Me — gold, rendered on top */}
                    {meSeries &&
                      currentUserId &&
                      selected.has(currentUserId) && (
                        <g>
                          {/* Glow halo */}
                          <polyline
                            points={meSeries.ranks
                              .map((r, i) => `${xFor(i)},${yFor(r)}`)
                              .join(" ")}
                            fill="none"
                            stroke={GOLD}
                            strokeWidth={8}
                            strokeOpacity={0.15}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Main gold line */}
                          <polyline
                            points={meSeries.ranks
                              .map((r, i) => `${xFor(i)},${yFor(r)}`)
                              .join(" ")}
                            fill="none"
                            stroke={`url(#${gradId})`}
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <title>{t("trajectoryYou")}</title>
                          </polyline>
                          {/* Waypoint dots */}
                          {meSeries.ranks.slice(0, -1).map((r, i) => (
                            <circle
                              key={`me-wp-${i}`}
                              cx={xFor(i)}
                              cy={yFor(r)}
                              r="3"
                              fill={NAVY}
                              stroke={GOLD_LIGHT}
                              strokeWidth="1.8"
                            />
                          ))}
                          {/* End circle marker */}
                          <circle
                            cx={xFor(nSteps - 1)}
                            cy={yFor(meSeries.ranks[nSteps - 1]!)}
                            r={14}
                            fill={GOLD}
                          />
                          <circle
                            cx={xFor(nSteps - 1)}
                            cy={yFor(meSeries.ranks[nSteps - 1]!)}
                            r={14}
                            fill="none"
                            stroke={CREAM}
                            strokeWidth="1.5"
                          />
                          <text
                            x={xFor(nSteps - 1)}
                            y={yFor(meSeries.ranks[nSteps - 1]!) + 4.5}
                            fill={NAVY}
                            fontSize="11"
                            fontWeight="800"
                            textAnchor="middle"
                          >
                            {t("trajectoryYou")}
                          </text>
                          {/* Rank-delta pill */}
                          {meDelta !== 0 && (
                            <g
                              transform={`translate(${
                                xFor(nSteps - 1) + 16
                              }, ${
                                yFor(meSeries.ranks[nSteps - 1]!) - 22
                              })`}
                            >
                              <rect
                                x="0"
                                y="0"
                                width="30"
                                height="17"
                                rx="8.5"
                                fill={meDelta > 0 ? SUCCESS : DANGER}
                              />
                              <path
                                d={
                                  meDelta > 0
                                    ? "M6 11 l4 -5 l4 5"
                                    : "M6 7 l4 5 l4 -5"
                                }
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <text
                                x="21"
                                y="12.5"
                                fill="#FFFFFF"
                                fontSize="10"
                                fontWeight="800"
                                textAnchor="middle"
                              >
                                {Math.abs(meDelta)}
                              </text>
                            </g>
                          )}
                        </g>
                      )}
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* ── Side panel ──────────────────────────────────────────────────── */}
          <div className="shrink-0 lg:w-64">
            <div
              style={{
                background: NAVY,
                border: `1px solid ${GOLD}33`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* Panel header + preset buttons */}
              <div
                style={{
                  padding: "10px 12px 10px 12px",
                  borderBottom: `1px solid ${GOLD}22`,
                }}
              >
                <p
                  style={{
                    color: CREAM,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                    opacity: 0.7,
                  }}
                >
                  {t("trajectoryPlayers")}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {(
                    [
                      { key: "trajectoryTop10", action: () => selectTop(10) },
                      { key: "trajectoryTop25", action: () => selectTop(25) },
                      { key: "trajectoryAll", action: selectAll },
                      { key: "trajectoryNone", action: selectNone },
                    ] as const
                  ).map(({ key, action }) => (
                    <button
                      key={key}
                      onClick={action}
                      style={{
                        background: `${GOLD}1A`,
                        border: `1px solid ${GOLD}44`,
                        borderRadius: 6,
                        color: GOLD_LIGHT,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 8px",
                        cursor: "pointer",
                      }}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable player list */}
              <div style={{ maxHeight: 324, overflowY: "auto", padding: 4 }}>
                {sorted.map((s) => {
                  const isMe = s.userId === currentUserId;
                  const isSelected = selected.has(s.userId);
                  const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
                  const rank = finalRank(s);
                  return (
                    <button
                      key={s.userId}
                      onClick={() => togglePlayer(s.userId)}
                      onMouseEnter={() => setHoveredId(s.userId)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "5px 8px",
                        borderRadius: 8,
                        background: isSelected ? `${color}18` : "transparent",
                        opacity: isSelected ? 1 : 0.4,
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "opacity 0.1s, background 0.1s",
                      }}
                    >
                      {/* Color swatch */}
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      {/* Display name */}
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          color: isMe ? GOLD : CREAM,
                          fontWeight: isMe ? 700 : 400,
                        }}
                      >
                        {s.displayName}
                      </span>
                      {/* Current rank */}
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 10,
                          color: CREAM,
                          opacity: 0.5,
                        }}
                      >
                        {rank === Infinity ? "–" : `${rank}º`}
                      </span>
                      {/* Selected indicator */}
                      {isSelected && (
                        <Check
                          size={11}
                          style={{ color, flexShrink: 0 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {t("trajectoryFootnote", { count: playerCount })}
      </p>
    </section>
  );
}
