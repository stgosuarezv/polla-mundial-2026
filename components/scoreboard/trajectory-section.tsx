"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankHistorySeries } from "@/lib/scoring/rank-history";

interface TrajectorySectionProps {
  series: RankHistorySeries[];
  stepLabels: string[];    // "BRA-CRO" per match step
  stepDates: string[];     // "2026-06-01" per match step
  stepRoundKeys: string[]; // "rounds.group_1" per match step
  currentUserId: string | null;
  playerCount: number;
}

type ViewMode = "round" | "day" | "match";

// Always-dark "race board" palette.
const NAVY = "#1A2855";
const NAVY_DEEP = "#141F44";
const CREAM = "#F5F0E6";
const GOLD = "#F4C430";
const GOLD_LIGHT = "#F8DD8A";
const SUCCESS = "#1EA64F";
const DANGER = "#E10F1E";
const OTHER_FALLBACK = "#7C8AB0";

// Round key → short X-axis label.
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

// ── Plot geometry (shared between browser SVG and export) ────────────────────
const GUTTER_W = 56;    // fixed rank-label sidebar width (px)
const VBH = 400;        // total SVG height
const PLOT_TOP = 72;    // y of rank-1 gridline
const PLOT_BOTTOM = 360; // y of domainMax gridline
const PAD_L = 24;       // left padding inside the scrollable plot SVG
const PAD_R = 72;       // right padding (room for end dot + initials)

// Step widths per view mode.
const STEP_W: Record<ViewMode, number> = { round: 72, day: 28, match: 40 };

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

// ── Export SVG builder ────────────────────────────────────────────────────────
// Generates a self-contained SVG string for PNG/PDF download. Pure function —
// no DOM reads.
function buildExportSvg(opts: {
  title: string;
  subtitle: string;
  labels: string[];
  stepW: number;
  aggSeries: Array<{ userId: string; displayName: string; aggRanks: number[] }>;
  meAggRanks: number[] | null;
  currentUserId: string | null;
  colorMap: Map<string, string>;
  domainMax: number;
  rankLabelArr: number[];
  meDelta: number;
  youLabel: string;
}): string {
  const {
    title, subtitle, labels, stepW, aggSeries, meAggRanks, currentUserId,
    colorMap, domainMax, rankLabelArr, meDelta, youLabel,
  } = opts;

  const nSteps = labels.length;
  const plotW = Math.max(600, PAD_L + (nSteps - 1) * stepW + PAD_R);
  const totalW = GUTTER_W + plotW;

  const xFor = (i: number) => GUTTER_W + PAD_L + i * stepW;
  const yFor = (rank: number) =>
    PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * (rank - 1)) / Math.max(1, domainMax - 1);

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const gutterLabels = rankLabelArr
    .map(
      (r) =>
        `<text x="${GUTTER_W - 8}" y="${yFor(r) + 4}" fill="${CREAM}" fill-opacity="0.5" font-size="11" font-weight="600" text-anchor="end">${r}º</text>`
    )
    .join("");

  const gridlines = rankLabelArr
    .map(
      (r) =>
        `<line x1="${GUTTER_W}" y1="${yFor(r)}" x2="${totalW}" y2="${yFor(r)}" stroke="${CREAM}" stroke-opacity="0.06"/>`
    )
    .join("");

  const ticks = labels
    .map((label, i) => {
      const x = xFor(i);
      const isLast = i === nSteps - 1;
      return `<line x1="${x}" y1="${PLOT_TOP - 8}" x2="${x}" y2="${PLOT_BOTTOM + 8}" stroke="${CREAM}" stroke-opacity="0.05"/>
<text x="${x}" y="${PLOT_TOP - 14}" fill="${isLast ? GOLD : CREAM}" fill-opacity="${isLast ? "1" : "0.6"}" font-size="9" font-weight="${isLast ? "700" : "500"}" text-anchor="end" transform="rotate(-50,${x},${PLOT_TOP - 14})">${esc(label)}</text>`;
    })
    .join("");

  const otherLines = aggSeries
    .filter((s) => s.userId !== currentUserId)
    .map((s) => {
      const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
      const pts = s.aggRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");
      const lastRank = s.aggRanks.at(-1);
      const lx = xFor(nSteps - 1);
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round"/>
${lastRank !== undefined ? `<circle cx="${lx}" cy="${yFor(lastRank)}" r="3" fill="${color}"/><text x="${lx + 8}" y="${yFor(lastRank) + 4}" fill="${color}" fill-opacity="0.85" font-size="9" font-weight="600">${esc(initials(s.displayName))}</text>` : ""}`;
    })
    .join("");

  const meLine = (() => {
    if (!meAggRanks || meAggRanks.length === 0) return "";
    const pts = meAggRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");
    const lastRank = meAggRanks.at(-1)!;
    const lx = xFor(nSteps - 1);
    const ly = yFor(lastRank);
    const waydots = meAggRanks
      .slice(0, -1)
      .map(
        (r, i) =>
          `<circle cx="${xFor(i)}" cy="${yFor(r)}" r="2.5" fill="${NAVY}" stroke="${GOLD_LIGHT}" stroke-width="1.5"/>`
      )
      .join("");
    const pill =
      meDelta !== 0
        ? `<g transform="translate(${lx + 16},${ly - 22})"><rect x="0" y="0" width="30" height="17" rx="8.5" fill="${meDelta > 0 ? SUCCESS : DANGER}"/><path d="${meDelta > 0 ? "M6 11 l4 -5 l4 5" : "M6 7 l4 5 l4 -5"}" fill="none" stroke="#FFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="21" y="12.5" fill="#FFF" font-size="10" font-weight="800" text-anchor="middle">${Math.abs(meDelta)}</text></g>`
        : "";
    return `<polyline points="${pts}" fill="none" stroke="${GOLD}" stroke-width="6" stroke-opacity="0.12" stroke-linecap="round" stroke-linejoin="round"/>
<polyline points="${pts}" fill="none" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
${waydots}
<circle cx="${lx}" cy="${ly}" r="13" fill="${GOLD}"/>
<circle cx="${lx}" cy="${ly}" r="13" fill="none" stroke="${CREAM}" stroke-width="1.5"/>
<text x="${lx}" y="${ly + 4.5}" fill="${NAVY}" font-size="11" font-weight="800" text-anchor="middle">${esc(youLabel)}</text>
${pill}`;
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${VBH}" font-family="system-ui,-apple-system,sans-serif">
<rect width="${totalW}" height="${VBH}" fill="${NAVY_DEEP}"/>
<text x="${GUTTER_W + PAD_L}" y="24" fill="${CREAM}" font-size="15" font-weight="700">${esc(title)}</text>
<text x="${GUTTER_W + PAD_L}" y="42" fill="${CREAM}" font-size="12" opacity="0.55">${esc(subtitle)}</text>
${gutterLabels}${gridlines}${ticks}${otherLines}${meLine}
</svg>`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TrajectorySection({
  series,
  stepLabels,
  stepDates,
  stepRoundKeys,
  currentUserId,
  playerCount,
}: TrajectorySectionProps) {
  const t = useTranslations("scoreboard");

  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("round");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(series.map((s) => s.userId))
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"png" | "pdf" | null>(null);

  // Sort series by final rank (ascending) — stable ordering for color assignment.
  const sorted = useMemo(
    () => [...series].sort((a, b) => finalRank(a) - finalRank(b)),
    [series]
  );

  // Stable per-player color keyed by sorted index.
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sorted.forEach((s, i) => {
      map.set(s.userId, playerColor(i, s.userId === currentUserId));
    });
    return map;
  }, [sorted, currentUserId]);

  // Derived display data based on view mode.
  const displayData = useMemo((): {
    labels: string[];
    getSeriesRanks: (s: RankHistorySeries) => number[];
    stepW: number;
    useViewBox: boolean; // true = SVG scales to fit; false = fixed pixel width + scroll
  } => {
    if (viewMode === "match") {
      return {
        labels: stepLabels,
        getSeriesRanks: (s) => s.ranks,
        stepW: STEP_W.match,
        useViewBox: false,
      };
    }

    const keyOf = (i: number): string =>
      viewMode === "day" ? (stepDates[i] ?? "") : (stepRoundKeys[i] ?? "");

    const uniqueKeys: string[] = [];
    const seen = new Set<string>();
    const lastIndexOf = new Map<string, number>();

    for (let i = 0; i < stepLabels.length; i++) {
      const k = keyOf(i);
      if (k && !seen.has(k)) {
        seen.add(k);
        uniqueKeys.push(k);
      }
      if (k) lastIndexOf.set(k, i);
    }

    const labels =
      viewMode === "day"
        ? uniqueKeys.map((d) => d.slice(5).replace("-", "/"))
        : uniqueKeys.map(
            (k) => SHORT_LABEL[k.replace(/^rounds\./, "")] ?? k.replace(/^rounds\./, "")
          );

    return {
      labels,
      getSeriesRanks: (s) =>
        uniqueKeys.map((k) => {
          const idx = lastIndexOf.get(k) ?? s.ranks.length - 1;
          return s.ranks[idx] ?? s.ranks.at(-1) ?? 1;
        }),
      stepW: STEP_W[viewMode],
      useViewBox: viewMode === "round",
    };
  }, [viewMode, stepLabels, stepDates, stepRoundKeys]);

  const displayLabels = displayData.labels;
  const nSteps = displayLabels.length;
  const currentStepW = displayData.stepW;
  const plotW = Math.max(600, PAD_L + (nSteps - 1) * currentStepW + PAD_R);

  const xFor = (i: number) => PAD_L + i * currentStepW;
  const xForExport = (i: number) => GUTTER_W + PAD_L + i * currentStepW;

  const selectedSeries = useMemo(
    () => sorted.filter((s) => selected.has(s.userId)),
    [sorted, selected]
  );

  const domainMax = useMemo(() => {
    if (selectedSeries.length === 0) return 2;
    return Math.max(
      2,
      ...selectedSeries.flatMap((s) => displayData.getSeriesRanks(s))
    );
  }, [selectedSeries, displayData]);

  const yFor = (rank: number) =>
    PLOT_TOP +
    ((PLOT_BOTTOM - PLOT_TOP) * (rank - 1)) / Math.max(1, domainMax - 1);

  const rankLabelArr = useMemo(() => {
    const labels = new Set<number>([1, domainMax]);
    for (let r = 5; r < domainMax; r += 5) labels.add(r);
    return [...labels].sort((a, b) => a - b);
  }, [domainMax]);

  // Me — aggregated ranks for current view.
  const meSeries = currentUserId
    ? (series.find((s) => s.userId === currentUserId) ?? null)
    : null;
  const meIsSelected = currentUserId !== null && selected.has(currentUserId);
  const meRanks = meSeries ? displayData.getSeriesRanks(meSeries) : null;
  const meDelta = (() => {
    if (!meRanks || meRanks.length < 2) return 0;
    return meRanks[meRanks.length - 2]! - meRanks[meRanks.length - 1]!;
  })();

  // ── Preset handlers ────────────────────────────────────────────────────────
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

  // ── Export helpers ─────────────────────────────────────────────────────────
  const buildSvgString = useCallback((): string => {
    const aggSeries = selectedSeries.map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      aggRanks: displayData.getSeriesRanks(s),
    }));
    const meAggRanks =
      meSeries && meIsSelected ? displayData.getSeriesRanks(meSeries) : null;
    return buildExportSvg({
      title: t("trajectoryTitle"),
      subtitle: displayLabels.length === stepLabels.length
        ? t("trajectoryViewByMatch")
        : viewMode === "day"
        ? t("trajectoryViewByDay")
        : t("trajectoryViewByRound"),
      labels: displayLabels,
      stepW: currentStepW,
      aggSeries,
      meAggRanks,
      currentUserId,
      colorMap,
      domainMax,
      rankLabelArr,
      meDelta,
      youLabel: t("trajectoryYou"),
    });
  }, [
    selectedSeries,
    displayData,
    meSeries,
    meIsSelected,
    displayLabels,
    stepLabels.length,
    viewMode,
    currentUserId,
    colorMap,
    domainMax,
    rankLabelArr,
    meDelta,
    currentStepW,
    t,
  ]);

  const handleDownloadPng = useCallback(async () => {
    if (downloading) return;
    setDownloading("png");
    try {
      const svgStr = buildSvgString();
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const scale = 2;
          const totalW = GUTTER_W + plotW;
          const canvas = document.createElement("canvas");
          canvas.width = totalW * scale;
          canvas.height = VBH * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); resolve(); return; }
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob((pngBlob) => {
            if (!pngBlob) { resolve(); return; }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(pngBlob);
            a.download = "la-carrera.png";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            resolve();
          }, "image/png");
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
      });
    } finally {
      setDownloading(null);
    }
  }, [downloading, buildSvgString, plotW]);

  const handleDownloadPdf = useCallback(() => {
    if (downloading) return;
    setDownloading("pdf");
    try {
      const svgStr = buildSvgString();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:${NAVY_DEEP}}svg{display:block;max-width:100%}
@media print{@page{size:landscape;margin:5mm}}</style>
</head><body>${svgStr}<script>window.print();<\/script></body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!w) window.location.href = url;
    } finally {
      setDownloading(null);
    }
  }, [downloading, buildSvgString]);

  // ── Header (always rendered) ──────────────────────────────────────────────
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

  return (
    <section className="space-y-3 print:hidden">
      {header}

      {open && nSteps < 2 && (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t("trajectoryEmpty")}
        </div>
      )}

      {open && nSteps >= 2 && (
        <>
          {/* ── Control bar: view toggle + downloads ──────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(["round", "day", "match"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: viewMode === mode ? GOLD : `${GOLD}18`,
                    color: viewMode === mode ? NAVY : GOLD_LIGHT,
                    border: `1px solid ${GOLD}44`,
                  }}
                >
                  {t(
                    mode === "round"
                      ? "trajectoryViewByRound"
                      : mode === "day"
                      ? "trajectoryViewByDay"
                      : "trajectoryViewByMatch"
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPng}
                disabled={downloading !== null}
              >
                {downloading === "png" ? "…" : t("trajectoryDownloadPng")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloading !== null}
              >
                {downloading === "pdf" ? "…" : t("trajectoryDownloadPdf")}
              </Button>
            </div>
          </div>

          {/* ── Chart + panel ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Chart area */}
            <div className="min-w-0 flex-1">
              <div
                style={{
                  background: NAVY_DEEP,
                  borderRadius: 12,
                  border: `1px solid ${GOLD}33`,
                  padding: "14px 0 12px 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  {/* Fixed rank-gutter SVG */}
                  <svg
                    width={GUTTER_W}
                    height={VBH}
                    style={{ flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    {rankLabelArr.map((r) => (
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

                  {/* Plot SVG — fixed pixel width with scroll for "match" and
                      "day" views; viewBox-scaled (no scroll) for "round" view */}
                  <div
                    style={{
                      overflowX: displayData.useViewBox ? "hidden" : "auto",
                      flexGrow: 1,
                    }}
                  >
                    <svg
                      width={displayData.useViewBox ? "100%" : plotW}
                      height={VBH}
                      viewBox={
                        displayData.useViewBox
                          ? `0 0 ${plotW} ${VBH}`
                          : undefined
                      }
                      role="img"
                      style={{ display: "block" }}
                    >
                      <title>{t("trajectoryTitle")}</title>
                      <desc>{t("trajectoryAria")}</desc>

                      <defs>
                        <linearGradient
                          id="trajMe"
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
                      {rankLabelArr.map((r) => (
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

                      {/* Per-step vertical ticks + rotated labels */}
                      {displayLabels.map((label, i) => {
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
                          const ranks = displayData.getSeriesRanks(s);
                          const pts = ranks
                            .map((r, i) => `${xFor(i)},${yFor(r)}`)
                            .join(" ");
                          const lastRank = ranks.at(-1);
                          return (
                            <g key={s.userId}>
                              <polyline
                                points={pts}
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

                      {/* Me — gold, always on top */}
                      {meSeries && meIsSelected && meRanks && (
                        <g>
                          {/* Glow */}
                          <polyline
                            points={meRanks
                              .map((r, i) => `${xFor(i)},${yFor(r)}`)
                              .join(" ")}
                            fill="none"
                            stroke={GOLD}
                            strokeWidth={8}
                            strokeOpacity={0.14}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Main line */}
                          <polyline
                            points={meRanks
                              .map((r, i) => `${xFor(i)},${yFor(r)}`)
                              .join(" ")}
                            fill="none"
                            stroke="url(#trajMe)"
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <title>{t("trajectoryYou")}</title>
                          </polyline>
                          {/* Waypoint dots */}
                          {meRanks.slice(0, -1).map((r, i) => (
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
                          {/* End circle */}
                          <circle
                            cx={xFor(nSteps - 1)}
                            cy={yFor(meRanks.at(-1)!)}
                            r={14}
                            fill={GOLD}
                          />
                          <circle
                            cx={xFor(nSteps - 1)}
                            cy={yFor(meRanks.at(-1)!)}
                            r={14}
                            fill="none"
                            stroke={CREAM}
                            strokeWidth="1.5"
                          />
                          <text
                            x={xFor(nSteps - 1)}
                            y={yFor(meRanks.at(-1)!) + 4.5}
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
                              transform={`translate(${xFor(nSteps - 1) + 16},${yFor(meRanks.at(-1)!) - 22})`}
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
                                stroke="#FFF"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <text
                                x="21"
                                y="12.5"
                                fill="#FFF"
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

            {/* ── Side panel ─────────────────────────────────────────────── */}
            <div className="shrink-0 lg:w-64">
              <div
                style={{
                  background: NAVY,
                  border: `1px solid ${GOLD}33`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* Preset buttons */}
                <div
                  style={{
                    padding: "10px 12px",
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                          background: isSelected
                            ? `${color}18`
                            : "transparent",
                          opacity: isSelected ? 1 : 0.4,
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "opacity 0.1s, background 0.1s",
                        }}
                      >
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: color,
                            flexShrink: 0,
                          }}
                        />
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
        </>
      )}

      <p className="text-muted-foreground text-xs">
        {t("trajectoryFootnote", { count: playerCount })}
      </p>
    </section>
  );
}
