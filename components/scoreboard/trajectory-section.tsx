"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChevronDown, Check, Maximize2, Minimize2, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankHistorySeries } from "@/lib/scoring/rank-history";

interface TrajectorySectionProps {
  series: RankHistorySeries[];
  stepLabels: string[];
  stepDates: string[];
  stepRoundKeys: string[];
  currentUserId: string | null;
  playerCount: number;
}

type ViewMode = "round" | "day" | "match";
type YAxisMode = "places" | "points";

// ── Brand palette (theme-independent) ────────────────────────────────────────
const GOLD = "#F4C430";
const GOLD_LIGHT = "#F8DD8A";
const GOLD_DARK = "#A07800"; // darker gold for light backgrounds
const NAVY = "#1A2855";
const NAVY_DEEP = "#141F44";
const CREAM = "#F5F0E6";
const SUCCESS = "#1EA64F";
const DANGER = "#E10F1E";

// ── Theme-aware board palette (SVG fills) ────────────────────────────────────
function makeBoardPalette(isDark: boolean) {
  return isDark
    ? {
        bg: NAVY_DEEP,
        border: `${GOLD}33`,
        gridOpacity: 0.06,
        text: CREAM,
        textOp: 0.5,
        waypointFill: NAVY_DEEP,
        tickLastColor: GOLD,
        hoverBg: NAVY,
        fallback: "#7C8AB0",
      }
    : {
        bg: "#FFFFFF",
        border: `${NAVY}22`,
        gridOpacity: 0.08,
        text: NAVY,
        textOp: 0.55,
        waypointFill: "#FFFFFF",
        tickLastColor: GOLD_DARK,
        hoverBg: CREAM,
        fallback: "#5E7BBF",
      };
}

// ── Theme-aware player panel palette ─────────────────────────────────────────
function makePanelPalette(isDark: boolean) {
  return isDark
    ? { bg: NAVY, border: `${GOLD}33`, name: CREAM, me: GOLD }
    : { bg: CREAM, border: `${NAVY}22`, name: NAVY, me: GOLD_DARK };
}

// ── Round short labels ────────────────────────────────────────────────────────
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

// ── Plot geometry ─────────────────────────────────────────────────────────────
const GUTTER_W = 56;
const EXPORT_VBH = 440; // fixed height for PNG/PDF export
const EXPORT_PLOT_TOP = Math.round(EXPORT_VBH * 0.16);
const EXPORT_PLOT_BOTTOM = Math.round(EXPORT_VBH * 0.90);
const PLOT_TOP_FRAC = 0.16;
const PLOT_BOTTOM_FRAC = 0.90;
const PAD_L = 24;
const PAD_R = 72;
const STEP_W: Record<ViewMode, number> = { round: 72, day: 28, match: 40 };
const BRUSH_H = 28;
const DEFAULT_PLOT_H = 620;

// ── Utilities ─────────────────────────────────────────────────────────────────
function playerColor(index: number, isMe: boolean, isDark: boolean): string {
  if (isMe) return GOLD;
  return `hsl(${(index * 47) % 360}, 55%, ${isDark ? 64 : 38}%)`;
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

function yPlaces(rank: number, top: number, bottom: number, domainMax: number): number {
  return top + ((bottom - top) * (rank - 1)) / Math.max(1, domainMax - 1);
}

function yPoints(pts: number, top: number, bottom: number, maxPts: number): number {
  return bottom - ((bottom - top) * pts) / Math.max(1, maxPts);
}

// ── Export SVG builder (pure, no DOM) ─────────────────────────────────────────
function buildExportSvg(opts: {
  title: string;
  subtitle: string;
  labels: string[];
  stepW: number;
  aggSeries: Array<{ userId: string; displayName: string; values: number[] }>;
  meValues: number[] | null;
  currentUserId: string | null;
  colorMap: Map<string, string>;
  yAxisMode: YAxisMode;
  placesDomainMax: number;
  maxPoints: number;
  rankLabelArr: number[];
  meDelta: number;
  youLabel: string;
  isDark: boolean;
}): string {
  const {
    title, subtitle, labels, stepW, aggSeries, meValues, currentUserId,
    colorMap, yAxisMode, placesDomainMax, maxPoints, rankLabelArr, meDelta,
    youLabel, isDark,
  } = opts;

  const board = makeBoardPalette(isDark);
  const top = EXPORT_PLOT_TOP;
  const bottom = EXPORT_PLOT_BOTTOM;
  const nSteps = labels.length;
  const plotW = Math.max(600, PAD_L + (nSteps - 1) * stepW + PAD_R);
  const totalW = GUTTER_W + plotW;

  const xFor = (i: number) => GUTTER_W + PAD_L + i * stepW;
  const yFor = (v: number) =>
    yAxisMode === "places"
      ? yPlaces(v, top, bottom, placesDomainMax)
      : yPoints(v, top, bottom, maxPoints);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const fmtLabel = (v: number) => yAxisMode === "places" ? `${v}º` : `${v}`;

  const gutterPart = rankLabelArr
    .map((r) =>
      `<text x="${GUTTER_W - 8}" y="${yFor(r) + 4}" fill="${board.text}" fill-opacity="${board.textOp}" font-size="11" font-weight="600" text-anchor="end">${esc(fmtLabel(r))}</text>`
    ).join("");

  const gridPart = rankLabelArr
    .map((r) =>
      `<line x1="${GUTTER_W}" y1="${yFor(r)}" x2="${totalW}" y2="${yFor(r)}" stroke="${board.text}" stroke-opacity="${board.gridOpacity}"/>`
    ).join("");

  const tickPart = labels
    .map((label, i) => {
      const x = xFor(i);
      const last = i === nSteps - 1;
      return (
        `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${bottom + 8}" stroke="${board.text}" stroke-opacity="0.05"/>` +
        `<text x="${x}" y="${top - 14}" fill="${last ? board.tickLastColor : board.text}" fill-opacity="${last ? "1" : board.textOp}" font-size="9" font-weight="${last ? "700" : "500"}" text-anchor="end" transform="rotate(-50,${x},${top - 14})">${esc(label)}</text>`
      );
    }).join("");

  const otherPart = aggSeries
    .filter((s) => s.userId !== currentUserId)
    .map((s) => {
      const color = colorMap.get(s.userId) ?? board.fallback;
      const pts = s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
      const lv = s.values.at(-1);
      const lx = xFor(nSteps - 1);
      return (
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round"/>` +
        (lv !== undefined
          ? `<circle cx="${lx}" cy="${yFor(lv)}" r="3" fill="${color}"/><text x="${lx + 8}" y="${yFor(lv) + 4}" fill="${color}" fill-opacity="0.85" font-size="9" font-weight="600">${esc(initials(s.displayName))}</text>`
          : "")
      );
    }).join("");

  const mePart = (() => {
    if (!meValues || meValues.length === 0) return "";
    const pts = meValues.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
    const lv = meValues.at(-1)!;
    const lx = xFor(nSteps - 1);
    const ly = yFor(lv);
    const dots = meValues
      .slice(0, -1)
      .map((v, i) => `<circle cx="${xFor(i)}" cy="${yFor(v)}" r="2.5" fill="${board.waypointFill}" stroke="${GOLD_LIGHT}" stroke-width="1.5"/>`)
      .join("");
    const pill =
      meDelta !== 0
        ? `<g transform="translate(${lx + 16},${ly - 22})"><rect x="0" y="0" width="30" height="17" rx="8.5" fill="${meDelta > 0 ? SUCCESS : DANGER}"/><path d="${meDelta > 0 ? "M6 11 l4 -5 l4 5" : "M6 7 l4 5 l4 -5"}" fill="none" stroke="#FFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="21" y="12.5" fill="#FFF" font-size="10" font-weight="800" text-anchor="middle">${Math.abs(meDelta)}</text></g>`
        : "";
    return (
      `<polyline points="${pts}" fill="none" stroke="${GOLD}" stroke-width="6" stroke-opacity="0.12" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<polyline points="${pts}" fill="none" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      dots +
      `<circle cx="${lx}" cy="${ly}" r="13" fill="${GOLD}"/>` +
      `<circle cx="${lx}" cy="${ly}" r="13" fill="none" stroke="${CREAM}" stroke-width="1.5"/>` +
      `<text x="${lx}" y="${ly + 4.5}" fill="${NAVY}" font-size="11" font-weight="800" text-anchor="middle">${esc(youLabel)}</text>` +
      pill
    );
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${EXPORT_VBH}" font-family="system-ui,-apple-system,sans-serif">
<rect width="${totalW}" height="${EXPORT_VBH}" fill="${board.bg}"/>
<text x="${GUTTER_W + PAD_L}" y="24" fill="${board.text}" font-size="15" font-weight="700">${esc(title)}</text>
<text x="${GUTTER_W + PAD_L}" y="42" fill="${board.text}" font-size="12" opacity="${board.textOp}">${esc(subtitle)}</text>
${gutterPart}${gridPart}${tickPart}${otherPart}${mePart}
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── State ────────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("round");
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("places");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(series.map((s) => s.userId))
  );
  const [panelHoveredId, setPanelHoveredId] = useState<string | null>(null);
  const [chartHoveredId, setChartHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"png" | "pdf" | null>(null);
  const [chartInnerW, setChartInnerW] = useState(600);

  // X-axis range keyed by view mode so switching modes never resets the sibling ranges.
  // Each mode starts as [0, 99999] (full range); clamped to totalSteps-1 at use time.
  const [rangeByMode, setRangeByMode] = useState<Record<ViewMode, [number, number]>>({
    round: [0, 99999],
    day: [0, 99999],
    match: [0, 99999],
  });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const brushDragRef = useRef<{
    target: "left" | "right" | "middle";
    containerWidth: number;
    startClientX: number;
    startRangeStart: number;
    startRangeEnd: number;
  } | null>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);

  // ── Palettes ─────────────────────────────────────────────────────────────────
  const board = makeBoardPalette(isDark);
  const panel = makePanelPalette(isDark);

  // ── Fullscreen / Esc ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  useEffect(() => {
    const el = chartCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setChartInnerW(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]); // re-run when the chart card mounts/unmounts

  // plotH: derive during render so there's no extra setState-in-effect cycle.
  // window may be undefined during SSR; isFullscreen starts false so no hydration mismatch.
  const plotH =
    isFullscreen && typeof window !== "undefined"
      ? Math.max(400, window.innerHeight - 280)
      : DEFAULT_PLOT_H;

  // ── Derived: plot top/bottom ──────────────────────────────────────────────────
  const plotTop = Math.round(plotH * PLOT_TOP_FRAC);
  const plotBottom = Math.round(plotH * PLOT_BOTTOM_FRAC);

  // ── Sorted players ────────────────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...series].sort((a, b) => finalRank(a) - finalRank(b)),
    [series]
  );

  // ── Color map ─────────────────────────────────────────────────────────────────
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sorted.forEach((s, i) => map.set(s.userId, playerColor(i, s.userId === currentUserId, isDark)));
    return map;
  }, [sorted, currentUserId, isDark]);

  // ── View aggregation ─────────────────────────────────────────────────────────
  const displayData = useMemo((): {
    labels: string[];
    getSeriesRanks: (s: RankHistorySeries) => number[];
    getSeriesPoints: (s: RankHistorySeries) => number[];
  } => {
    if (viewMode === "match") {
      return {
        labels: stepLabels,
        getSeriesRanks: (s) => s.ranks,
        getSeriesPoints: (s) => s.points,
      };
    }
    const keyOf = (i: number): string =>
      viewMode === "day" ? (stepDates[i] ?? "") : (stepRoundKeys[i] ?? "");
    const uniqueKeys: string[] = [];
    const seen = new Set<string>();
    const lastIndexOf = new Map<string, number>();
    for (let i = 0; i < stepLabels.length; i++) {
      const k = keyOf(i);
      if (k && !seen.has(k)) { seen.add(k); uniqueKeys.push(k); }
      if (k) lastIndexOf.set(k, i);
    }
    const labels =
      viewMode === "day"
        ? uniqueKeys.map((d) => d.slice(5).replace("-", "/"))
        : uniqueKeys.map((k) => SHORT_LABEL[k.replace(/^rounds\./, "")] ?? k.replace(/^rounds\./, ""));

    const getSeriesRanks = (s: RankHistorySeries) =>
      uniqueKeys.map((k) => {
        const idx = lastIndexOf.get(k) ?? s.ranks.length - 1;
        return s.ranks[idx] ?? s.ranks.at(-1) ?? 1;
      });
    const getSeriesPoints = (s: RankHistorySeries) =>
      uniqueKeys.map((k) => {
        const idx = lastIndexOf.get(k) ?? s.points.length - 1;
        return s.points[idx] ?? s.points.at(-1) ?? 0;
      });

    return { labels, getSeriesRanks, getSeriesPoints };
  }, [viewMode, stepLabels, stepDates, stepRoundKeys]);

  const allLabels = displayData.labels;
  const totalSteps = allLabels.length;

  // Per-mode range helpers
  const [rangeStart, rangeEnd] = rangeByMode[viewMode]!;
  const setRangeStart = (v: number) =>
    setRangeByMode((prev) => ({ ...prev, [viewMode]: [v, prev[viewMode]![1]!] as [number, number] }));
  const setRangeEnd = (v: number) =>
    setRangeByMode((prev) => ({ ...prev, [viewMode]: [prev[viewMode]![0]!, v] as [number, number] }));

  // Clamped effective window
  const effectiveStart = Math.max(0, Math.min(rangeStart, totalSteps - 2));
  const effectiveEnd = Math.max(effectiveStart + 1, Math.min(rangeEnd, totalSteps - 1));
  const displayLabels = allLabels.slice(effectiveStart, effectiveEnd + 1);
  const nSteps = displayLabels.length;
  // Dynamic step width: spread steps across the available plot area; scroll only when
  // the natural minimum-readable step width would overflow (e.g. 60+ matches).
  const naturalStepW = STEP_W[viewMode];
  const plotAreaW = Math.max(200, chartInnerW - GUTTER_W);
  const naturalPlotW = nSteps <= 1 ? plotAreaW : PAD_L + (nSteps - 1) * naturalStepW + PAD_R;
  const useScroll = naturalPlotW > plotAreaW;
  const currentStepW = useScroll || nSteps <= 1
    ? naturalStepW
    : (plotAreaW - PAD_L - PAD_R) / Math.max(1, nSteps - 1);
  const plotW = useScroll ? Math.max(300, naturalPlotW) : plotAreaW;
  const xFor = (i: number) => PAD_L + i * currentStepW;

  // ── Windowed values ──────────────────────────────────────────────────────────
  function getWindowedValues(s: RankHistorySeries, mode: YAxisMode): number[] {
    const full = mode === "places"
      ? displayData.getSeriesRanks(s)
      : displayData.getSeriesPoints(s);
    return full.slice(effectiveStart, effectiveEnd + 1);
  }

  // ── Selected series ───────────────────────────────────────────────────────────
  const selectedSeries = useMemo(
    () => sorted.filter((s) => selected.has(s.userId)),
    [sorted, selected]
  );

  // ── Y axis domain ─────────────────────────────────────────────────────────────
  // Places: always the full player count — selection never rescales the axis
  const placesDomainMax = playerCount;

  // Points: max across ALL series at any step, stable to selection changes
  const maxPoints = useMemo(() => {
    if (series.length === 0) return 100;
    return Math.max(1, ...series.flatMap((s) => s.points));
  }, [series]);

  const yFor = (v: number): number =>
    yAxisMode === "places"
      ? yPlaces(v, plotTop, plotBottom, placesDomainMax)
      : yPoints(v, plotTop, plotBottom, maxPoints);

  const rankLabelArr = useMemo((): number[] => {
    if (yAxisMode === "places") {
      const s = new Set<number>([1, placesDomainMax]);
      for (let r = 5; r <= placesDomainMax; r += 5) s.add(r);
      return [...s].sort((a, b) => a - b);
    } else {
      const step = maxPoints <= 50 ? 10 : maxPoints <= 200 ? 25 : 50;
      const arr: number[] = [0];
      for (let p = step; p < maxPoints; p += step) arr.push(p);
      arr.push(maxPoints);
      return arr;
    }
  }, [yAxisMode, placesDomainMax, maxPoints]);

  // ── "Me" series ───────────────────────────────────────────────────────────────
  const meSeries = currentUserId
    ? (series.find((s) => s.userId === currentUserId) ?? null)
    : null;
  const meIsSelected = currentUserId !== null && selected.has(currentUserId);
  const meValues = meSeries ? getWindowedValues(meSeries, yAxisMode) : null;
  const meDelta = (() => {
    if (!meValues || meValues.length < 2) return 0;
    const a = meValues[meValues.length - 2]!;
    const b = meValues[meValues.length - 1]!;
    // positive = improved (moved up in ranks, or gained points)
    return yAxisMode === "places" ? a - b : b - a;
  })();

  // ── Highlight / dim ───────────────────────────────────────────────────────────
  const effectiveHighlightId = pinnedId ?? chartHoveredId ?? panelHoveredId;
  const isHighlighted = (userId: string) =>
    effectiveHighlightId !== null && effectiveHighlightId === userId;
  const isDimmed = (userId: string) =>
    effectiveHighlightId !== null && effectiveHighlightId !== userId;

  // ── Chart event handlers ──────────────────────────────────────────────────────
  const handleLineEnter = useCallback((userId: string) => setChartHoveredId(userId), []);
  const handleLineLeave = useCallback(() => setChartHoveredId(null), []);
  const handleLineClick = useCallback(
    (e: React.MouseEvent, userId: string) => {
      e.stopPropagation();
      setPinnedId((prev) => (prev === userId ? null : userId));
    },
    []
  );
  const handleChartBgClick = useCallback(() => setPinnedId(null), []);

  // ── Player preset handlers ────────────────────────────────────────────────────
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

  // ── X-axis range preset handlers ──────────────────────────────────────────────
  const setLastN = (n: number) => {
    setRangeStart(Math.max(0, totalSteps - n));
    setRangeEnd(totalSteps - 1);
  };
  const setFullRange = () => { setRangeStart(0); setRangeEnd(99999); };
  const isFullRange = effectiveStart === 0 && effectiveEnd === totalSteps - 1;
  const isRangeMatch = (n: number | null): boolean => {
    if (n === null) return isFullRange;
    if (totalSteps <= n) return isFullRange;
    return effectiveStart === totalSteps - n && effectiveEnd === totalSteps - 1;
  };

  const rangePresets: { labelKey: string; n: number | null }[] =
    viewMode === "round"
      ? [
          { labelKey: "trajectoryLast3Rounds", n: 3 },
          { labelKey: "trajectoryLast5Rounds", n: 5 },
          { labelKey: "trajectoryAll", n: null },
        ]
      : viewMode === "day"
      ? [
          { labelKey: "trajectoryLast3Days", n: 3 },
          { labelKey: "trajectoryLastWeek", n: 7 },
          { labelKey: "trajectoryAll", n: null },
        ]
      : [
          { labelKey: "trajectoryLast10Matches", n: 10 },
          { labelKey: "trajectoryLast20Matches", n: 20 },
          { labelKey: "trajectoryAll", n: null },
        ];

  // ── Brush drag handlers ───────────────────────────────────────────────────────
  function handleBrushPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (totalSteps < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const leftPx = (effectiveStart / (totalSteps - 1)) * w;
    const rightPx = (effectiveEnd / (totalSteps - 1)) * w;
    const THRESHOLD = 12;

    let target: "left" | "right" | "middle";
    if (Math.abs(x - leftPx) <= THRESHOLD) {
      target = "left";
    } else if (Math.abs(x - rightPx) <= THRESHOLD) {
      target = "right";
    } else if (x > leftPx && x < rightPx) {
      target = "middle";
    } else {
      // Click outside selection — snap nearest handle to clicked step
      const clickedStep = Math.round((x / w) * (totalSteps - 1));
      const midPx = (leftPx + rightPx) / 2;
      if (x < midPx) {
        setRangeStart(Math.max(0, Math.min(clickedStep, effectiveEnd - 1)));
      } else {
        setRangeEnd(Math.max(effectiveStart + 1, Math.min(clickedStep, totalSteps - 1)));
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    brushDragRef.current = {
      target,
      containerWidth: w,
      startClientX: e.clientX,
      startRangeStart: effectiveStart,
      startRangeEnd: effectiveEnd,
    };
  }

  function handleBrushPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = brushDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const stepsPerPx = (totalSteps - 1) / d.containerWidth;
    const dSteps = Math.round(dx * stepsPerPx);

    if (d.target === "left") {
      setRangeStart(Math.max(0, Math.min(d.startRangeStart + dSteps, d.startRangeEnd - 1)));
    } else if (d.target === "right") {
      setRangeEnd(Math.max(d.startRangeStart + 1, Math.min(d.startRangeEnd + dSteps, totalSteps - 1)));
    } else {
      const windowSize = d.startRangeEnd - d.startRangeStart;
      const newStart = Math.max(0, Math.min(d.startRangeStart + dSteps, totalSteps - 1 - windowSize));
      setRangeStart(newStart);
      setRangeEnd(newStart + windowSize);
    }
  }

  function handleBrushPointerUp() {
    brushDragRef.current = null;
  }

  // ── Button styles ─────────────────────────────────────────────────────────────
  const viewBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? GOLD : (isDark ? `${GOLD}1A` : "rgba(0,0,0,0.06)"),
    color: active ? NAVY : (isDark ? GOLD_LIGHT : "rgba(0,0,0,0.75)"),
    border: `1px solid ${active ? GOLD : (isDark ? `${GOLD}44` : "rgba(0,0,0,0.2)")}`,
  });

  // ── Download ──────────────────────────────────────────────────────────────────
  const highlightedSeries =
    effectiveHighlightId && selected.has(effectiveHighlightId)
      ? selectedSeries.find((s) => s.userId === effectiveHighlightId) ?? null
      : null;

  function buildSvgString(): string {
    const aggSeries = selectedSeries.map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      values: getWindowedValues(s, yAxisMode),
    }));
    const mev = meSeries && meIsSelected ? getWindowedValues(meSeries, yAxisMode) : null;
    return buildExportSvg({
      title: t("trajectoryTitle"),
      subtitle:
        viewMode === "round"
          ? t("trajectoryViewByRound")
          : viewMode === "day"
          ? t("trajectoryViewByDay")
          : t("trajectoryViewByMatch"),
      labels: displayLabels,
      stepW: STEP_W[viewMode],
      aggSeries,
      meValues: mev,
      currentUserId,
      colorMap,
      yAxisMode,
      placesDomainMax,
      maxPoints,
      rankLabelArr,
      meDelta,
      youLabel: t("trajectoryYou"),
      isDark,
    });
  }

  async function handleDownloadPng() {
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
          const nw = displayLabels.length;
          const exportPlotW = Math.max(600, PAD_L + (nw - 1) * STEP_W[viewMode] + PAD_R);
          const totalW = GUTTER_W + exportPlotW;
          const canvas = document.createElement("canvas");
          canvas.width = totalW * scale;
          canvas.height = EXPORT_VBH * scale;
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
  }

  function handleDownloadPdf() {
    if (downloading) return;
    setDownloading("pdf");
    try {
      const svgStr = buildSvgString();
      const bgColor = makeBoardPalette(isDark).bg;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:${bgColor}}svg{display:block;max-width:100%}
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
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  const header = (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-muted/20"
    >
      <div className="flex flex-col gap-0.5">
        <h2
          className="font-bold"
          style={{ fontSize: "1.125rem", color: isDark ? CREAM : NAVY }}
        >
          {t("trajectoryTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("trajectorySubtitle")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setIsFullscreen((v) => !v); }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </div>
    </div>
  );

  // ── Brush percentage helpers ──────────────────────────────────────────────────
  const pct = (step: number) =>
    totalSteps <= 1 ? 0 : (step / (totalSteps - 1)) * 100;

  return (
    <section
      className="print:hidden"
      style={
        isFullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 50,
              overflowY: "auto",
              padding: "20px 24px",
              background: isDark ? "#09090b" : "#ffffff",
            }
          : {
              display: "flex",
              flexDirection: "column",
              gap: 12,
              borderRadius: 8,
              border: isDark ? "1px dashed #2E3D7A" : "1px dashed #D9CFBE",
              background: isDark ? "rgba(36,50,96,0.3)" : "rgba(232,224,208,0.3)",
              padding: 16,
            }
      }
    >
      {header}

      {open && nSteps < 2 && (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t("trajectoryEmpty")}
        </div>
      )}

      {open && nSteps >= 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* ── Control bar ───────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {/* View mode + Y-axis toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {/* View mode */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["round", "day", "match"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={viewBtnStyle(viewMode === mode)}
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

              {/* Separator */}
              <div style={{ width: 1, height: 16, background: isDark ? `${GOLD}33` : `${NAVY}22` }} />

              {/* Y-axis toggle */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["places", "points"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setYAxisMode(mode)}
                    style={viewBtnStyle(yAxisMode === mode)}
                  >
                    {t(mode === "places" ? "trajectoryAxisPlaces" : "trajectoryAxisPoints")}
                  </button>
                ))}
              </div>
            </div>

            {/* Downloads */}
            <div style={{ display: "flex", gap: 6 }}>
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

          {/* ── Chart board ───────────────────────────────────────────────── */}
          <div
            ref={chartCardRef}
            style={{
              background: board.bg,
              borderRadius: 12,
              border: `1px solid ${board.border}`,
              position: "relative",
            }}
          >
            {/* Hover / pin name overlay */}
            {highlightedSeries && (() => {
              const s = highlightedSeries;
              const vals = getWindowedValues(s, yAxisMode);
              const lv = vals.at(-1) ?? (yAxisMode === "places" ? 1 : 0);
              const color = colorMap.get(s.userId) ?? board.fallback;
              const isPinned = pinnedId === s.userId;
              const label = yAxisMode === "places" ? `${lv}º` : `${lv}`;
              return (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 12,
                    background: board.hoverBg,
                    border: `1.5px solid ${color}`,
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    color,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    zIndex: 10,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: board.text, opacity: board.textOp, fontWeight: 400, fontSize: 11 }}>
                    {label}
                  </span>
                  {s.displayName}
                  {isPinned && <Pin size={11} style={{ color: GOLD, flexShrink: 0 }} />}
                </div>
              );
            })()}

            <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 14 }}>
              {/* Fixed rank gutter */}
              <svg
                width={GUTTER_W}
                height={plotH}
                style={{ flexShrink: 0 }}
                aria-hidden="true"
              >
                {rankLabelArr.map((r) => (
                  <text
                    key={r}
                    x={GUTTER_W - 8}
                    y={yFor(r) + 4}
                    fill={board.text}
                    fillOpacity={board.textOp}
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="end"
                  >
                    {yAxisMode === "places" ? `${r}º` : `${r}`}
                  </text>
                ))}
              </svg>

              {/* Scrollable plot — scrolls only when naturalPlotW exceeds available width */}
              <div
                style={{
                  overflowX: useScroll ? "auto" : "hidden",
                  flexGrow: 1,
                }}
              >
                <svg
                  width={plotW}
                  height={plotH}
                  role="img"
                  style={{ display: "block", cursor: "default" }}
                  onClick={handleChartBgClick}
                >
                  <title>{t("trajectoryTitle")}</title>
                  <desc>{t("trajectoryAria")}</desc>

                  <defs>
                    <linearGradient id="trajMe" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor={GOLD} />
                      <stop offset="1" stopColor={GOLD_LIGHT} />
                    </linearGradient>
                  </defs>

                  {/* Gridlines */}
                  {rankLabelArr.map((r) => (
                    <line
                      key={`gl-${r}`}
                      x1={0} y1={yFor(r)} x2={plotW} y2={yFor(r)}
                      stroke={board.text}
                      strokeOpacity={board.gridOpacity}
                    />
                  ))}

                  {/* X-axis ticks + labels */}
                  {displayLabels.map((label, i) => {
                    const x = xFor(i);
                    const last = i === nSteps - 1;
                    return (
                      <g key={`step-${i}`}>
                        <line
                          x1={x} y1={plotTop - 8} x2={x} y2={plotBottom + 8}
                          stroke={board.text} strokeOpacity="0.05"
                        />
                        <text
                          x={x} y={plotTop - 14}
                          fill={last ? board.tickLastColor : board.text}
                          fillOpacity={last ? 1 : board.textOp}
                          fontSize="9"
                          fontWeight={last ? "700" : "500"}
                          textAnchor="end"
                          transform={`rotate(-50, ${x}, ${plotTop - 14})`}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}

                  {/* ── Other-player lines ─────────────────────────────────── */}
                  {selectedSeries
                    .filter((s) => s.userId !== currentUserId)
                    .map((s) => {
                      const color = colorMap.get(s.userId) ?? board.fallback;
                      const hl = isHighlighted(s.userId);
                      const dm = isDimmed(s.userId);
                      const vals = getWindowedValues(s, yAxisMode);
                      const pts = vals.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
                      const lv = vals.at(-1);
                      return (
                        <g key={s.userId}>
                          <polyline
                            points={pts}
                            fill="none"
                            stroke={color}
                            strokeWidth={hl ? 3.5 : 2}
                            strokeOpacity={dm ? 0.1 : hl ? 1 : 0.55}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ pointerEvents: "none" }}
                          >
                            <title>{s.displayName}</title>
                          </polyline>
                          {lv !== undefined && (
                            <circle
                              cx={xFor(nSteps - 1)} cy={yFor(lv)}
                              r={hl ? 5 : 3}
                              fill={color}
                              fillOpacity={dm ? 0.12 : 1}
                              style={{ pointerEvents: "none" }}
                            />
                          )}
                          {selected.size <= 12 && lv !== undefined && (
                            <text
                              x={xFor(nSteps - 1) + 8} y={yFor(lv) + 4}
                              fill={color} fillOpacity={dm ? 0.12 : 0.85}
                              fontSize="9" fontWeight="600"
                              style={{ pointerEvents: "none" }}
                            >
                              {initials(s.displayName)}
                            </text>
                          )}
                          {/* Wide transparent hitbox */}
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={20}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={() => handleLineEnter(s.userId)}
                            onMouseLeave={handleLineLeave}
                            onClick={(e) => handleLineClick(e, s.userId)}
                          />
                        </g>
                      );
                    })}

                  {/* ── Me — gold, always on top ───────────────────────────── */}
                  {meSeries && meIsSelected && meValues && (
                    <g>
                      {/* Glow */}
                      <polyline
                        points={meValues.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
                        fill="none" stroke={GOLD} strokeWidth={8} strokeOpacity={0.14}
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ pointerEvents: "none" }}
                      />
                      {/* Main line */}
                      <polyline
                        points={meValues.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
                        fill="none" stroke="url(#trajMe)" strokeWidth={4}
                        strokeOpacity={isDimmed(currentUserId!) ? 0.15 : 1}
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ pointerEvents: "none" }}
                      >
                        <title>{t("trajectoryYou")}</title>
                      </polyline>
                      {/* Waypoints */}
                      {meValues.slice(0, -1).map((v, i) => (
                        <circle
                          key={`me-wp-${i}`}
                          cx={xFor(i)} cy={yFor(v)} r="3"
                          fill={board.waypointFill} stroke={GOLD_LIGHT} strokeWidth="1.8"
                          style={{ pointerEvents: "none" }}
                        />
                      ))}
                      {/* End circle */}
                      <circle
                        cx={xFor(nSteps - 1)} cy={yFor(meValues.at(-1)!)} r={14}
                        fill={GOLD} style={{ pointerEvents: "none" }}
                      />
                      <circle
                        cx={xFor(nSteps - 1)} cy={yFor(meValues.at(-1)!)} r={14}
                        fill="none" stroke={CREAM} strokeWidth="1.5"
                        style={{ pointerEvents: "none" }}
                      />
                      <text
                        x={xFor(nSteps - 1)} y={yFor(meValues.at(-1)!) + 4.5}
                        fill={NAVY} fontSize="11" fontWeight="800" textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {t("trajectoryYou")}
                      </text>
                      {/* Delta pill */}
                      {meDelta !== 0 && (
                        <g
                          transform={`translate(${xFor(nSteps - 1) + 16},${yFor(meValues.at(-1)!) - 22})`}
                          style={{ pointerEvents: "none" }}
                        >
                          <rect x="0" y="0" width="30" height="17" rx="8.5"
                            fill={meDelta > 0 ? SUCCESS : DANGER} />
                          <path
                            d={meDelta > 0 ? "M6 11 l4 -5 l4 5" : "M6 7 l4 5 l4 -5"}
                            fill="none" stroke="#FFF" strokeWidth="1.8"
                            strokeLinecap="round" strokeLinejoin="round"
                          />
                          <text x="21" y="12.5" fill="#FFF" fontSize="10"
                            fontWeight="800" textAnchor="middle">
                            {Math.abs(meDelta)}
                          </text>
                        </g>
                      )}
                      {/* Hitbox */}
                      <polyline
                        points={meValues.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
                        fill="none" stroke="transparent" strokeWidth={20}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => handleLineEnter(currentUserId!)}
                        onMouseLeave={handleLineLeave}
                        onClick={(e) => handleLineClick(e, currentUserId!)}
                      />
                    </g>
                  )}
                </svg>
              </div>
            </div>

            {/* ── X-range controls (presets + brush) ────────────────────── */}
            {totalSteps >= 3 && (
              <div
                style={{
                  padding: `8px ${PAD_R}px 10px ${GUTTER_W}px`,
                  borderTop: `1px solid ${isDark ? `${CREAM}08` : `${NAVY}08`}`,
                }}
              >
                {/* Preset buttons */}
                <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                  {rangePresets.map(({ labelKey, n }) => (
                    <button
                      key={labelKey}
                      onClick={() => (n === null ? setFullRange() : setLastN(n))}
                      style={{
                        ...viewBtnStyle(isRangeMatch(n)),
                        padding: "2px 8px",
                        fontSize: 11,
                      }}
                    >
                      {t(labelKey as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>

                {/* Brush */}
                <div
                  style={{
                    position: "relative",
                    height: BRUSH_H,
                    cursor: "default",
                    touchAction: "none",
                    userSelect: "none",
                  }}
                  onPointerDown={handleBrushPointerDown}
                  onPointerMove={handleBrushPointerMove}
                  onPointerUp={handleBrushPointerUp}
                >
                  {/* Track background */}
                  <div
                    style={{
                      position: "absolute",
                      top: 8, left: 0, right: 0, bottom: 8,
                      background: isDark ? `${CREAM}0A` : `${NAVY}0A`,
                      borderRadius: 4,
                    }}
                  />
                  {/* Step ticks (evenly distributed via flex) */}
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      top: 8, left: 0, right: 0, bottom: 8,
                      pointerEvents: "none",
                    }}
                  >
                    {allLabels.map((_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          borderRight: i < allLabels.length - 1
                            ? `1px solid ${isDark ? `${CREAM}15` : `${NAVY}15`}`
                            : "none",
                        }}
                      />
                    ))}
                  </div>
                  {/* Selected region */}
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: `${pct(effectiveStart)}%`,
                      width: `${pct(effectiveEnd) - pct(effectiveStart)}%`,
                      bottom: 8,
                      background: GOLD,
                      opacity: isDark ? 0.3 : 0.25,
                      borderRadius: 4,
                      pointerEvents: "none",
                    }}
                  />
                  {/* Left handle */}
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: `calc(${pct(effectiveStart)}% - 3px)`,
                      width: 6,
                      bottom: 4,
                      background: GOLD,
                      borderRadius: 3,
                      cursor: "ew-resize",
                      pointerEvents: "none",
                    }}
                  />
                  {/* Right handle */}
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: `calc(${pct(effectiveEnd)}% - 3px)`,
                      width: 6,
                      bottom: 4,
                      background: GOLD,
                      borderRadius: 3,
                      cursor: "ew-resize",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Player panel (full-width, below chart) ──────────────────── */}
          <div
            style={{
              background: panel.bg,
              border: `1px solid ${panel.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Preset buttons row */}
            <div
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${isDark ? `${GOLD}22` : `${NAVY}14`}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  color: panel.name,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                  flexShrink: 0,
                }}
              >
                {t("trajectoryPlayers")}
              </span>
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
                      background: isDark ? `${GOLD}1A` : `${NAVY}0D`,
                      border: `1px solid ${isDark ? `${GOLD}44` : `${NAVY}22`}`,
                      borderRadius: 6,
                      color: isDark ? GOLD_LIGHT : NAVY,
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

            {/* Player grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 2,
                padding: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {sorted.map((s) => {
                const isMe = s.userId === currentUserId;
                const isSel = selected.has(s.userId);
                const isPinned = pinnedId === s.userId;
                const color = colorMap.get(s.userId) ?? board.fallback;
                const rank = finalRank(s);
                return (
                  <button
                    key={s.userId}
                    onClick={() => togglePlayer(s.userId)}
                    onMouseEnter={() => setPanelHoveredId(s.userId)}
                    onMouseLeave={() => setPanelHoveredId(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: isSel ? `${color}18` : "transparent",
                      opacity: isSel ? 1 : 0.4,
                      border: isPinned ? `1.5px solid ${color}` : "1.5px solid transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "opacity 0.1s",
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: color, flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        color: isMe ? panel.me : panel.name,
                        fontWeight: isMe ? 700 : 400,
                      }}
                    >
                      {s.displayName}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: panel.name, opacity: 0.5 }}>
                      {rank === Infinity ? "–" : `${rank}º`}
                    </span>
                    {isPinned && <Pin size={10} style={{ color: GOLD, flexShrink: 0 }} />}
                    {isSel && !isPinned && <Check size={11} style={{ color, flexShrink: 0 }} />}
                  </button>
                );
              })}
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
