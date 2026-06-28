"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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

// Always-dark race-board palette.
const NAVY = "#1A2855";
const NAVY_DEEP = "#141F44";
const CREAM = "#F5F0E6";
const GOLD = "#F4C430";
const GOLD_LIGHT = "#F8DD8A";
const SUCCESS = "#1EA64F";
const DANGER = "#E10F1E";
const OTHER_FALLBACK = "#7C8AB0";

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

// ── Plot geometry ────────────────────────────────────────────────────────────
const GUTTER_W = 56;
const VBH = 400;
const PLOT_TOP = 72;
const PLOT_BOTTOM = 360;
const PAD_L = 24;
const PAD_R = 72;
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

// ── Export SVG builder (pure, no DOM) ────────────────────────────────────────
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

  const gutterPart = rankLabelArr
    .map(
      (r) =>
        `<text x="${GUTTER_W - 8}" y="${yFor(r) + 4}" fill="${CREAM}" fill-opacity="0.5" font-size="11" font-weight="600" text-anchor="end">${r}º</text>`
    )
    .join("");

  const gridPart = rankLabelArr
    .map(
      (r) =>
        `<line x1="${GUTTER_W}" y1="${yFor(r)}" x2="${totalW}" y2="${yFor(r)}" stroke="${CREAM}" stroke-opacity="0.06"/>`
    )
    .join("");

  const tickPart = labels
    .map((label, i) => {
      const x = xFor(i);
      const last = i === nSteps - 1;
      return `<line x1="${x}" y1="${PLOT_TOP - 8}" x2="${x}" y2="${PLOT_BOTTOM + 8}" stroke="${CREAM}" stroke-opacity="0.05"/>
<text x="${x}" y="${PLOT_TOP - 14}" fill="${last ? GOLD : CREAM}" fill-opacity="${last ? "1" : "0.6"}" font-size="9" font-weight="${last ? "700" : "500"}" text-anchor="end" transform="rotate(-50,${x},${PLOT_TOP - 14})">${esc(label)}</text>`;
    })
    .join("");

  const otherPart = aggSeries
    .filter((s) => s.userId !== currentUserId)
    .map((s) => {
      const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
      const pts = s.aggRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");
      const lr = s.aggRanks.at(-1);
      const lx = xFor(nSteps - 1);
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round"/>
${lr !== undefined ? `<circle cx="${lx}" cy="${yFor(lr)}" r="3" fill="${color}"/><text x="${lx + 8}" y="${yFor(lr) + 4}" fill="${color}" fill-opacity="0.85" font-size="9" font-weight="600">${esc(initials(s.displayName))}</text>` : ""}`;
    })
    .join("");

  const mePart = (() => {
    if (!meAggRanks || meAggRanks.length === 0) return "";
    const pts = meAggRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");
    const lr = meAggRanks.at(-1)!;
    const lx = xFor(nSteps - 1);
    const ly = yFor(lr);
    const dots = meAggRanks
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
${dots}
<circle cx="${lx}" cy="${ly}" r="13" fill="${GOLD}"/>
<circle cx="${lx}" cy="${ly}" r="13" fill="none" stroke="${CREAM}" stroke-width="1.5"/>
<text x="${lx}" y="${ly + 4.5}" fill="${NAVY}" font-size="11" font-weight="800" text-anchor="middle">${esc(youLabel)}</text>${pill}`;
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${VBH}" font-family="system-ui,-apple-system,sans-serif">
<rect width="${totalW}" height="${VBH}" fill="${NAVY_DEEP}"/>
<text x="${GUTTER_W + PAD_L}" y="24" fill="${CREAM}" font-size="15" font-weight="700">${esc(title)}</text>
<text x="${GUTTER_W + PAD_L}" y="42" fill="${CREAM}" font-size="12" opacity="0.55">${esc(subtitle)}</text>
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

  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("round");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(series.map((s) => s.userId))
  );
  // Three independent hover/pin sources → one effective highlight.
  const [panelHoveredId, setPanelHoveredId] = useState<string | null>(null);
  const [chartHoveredId, setChartHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"png" | "pdf" | null>(null);

  const effectiveHighlightId = pinnedId ?? chartHoveredId ?? panelHoveredId;

  // Esc exits fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Prevent body scroll while fullscreen.
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...series].sort((a, b) => finalRank(a) - finalRank(b)),
    [series]
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sorted.forEach((s, i) => map.set(s.userId, playerColor(i, s.userId === currentUserId)));
    return map;
  }, [sorted, currentUserId]);

  const displayData = useMemo((): {
    labels: string[];
    getSeriesRanks: (s: RankHistorySeries) => number[];
    stepW: number;
    useViewBox: boolean;
  } => {
    if (viewMode === "match") {
      return { labels: stepLabels, getSeriesRanks: (s) => s.ranks, stepW: STEP_W.match, useViewBox: false };
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
    return {
      labels,
      getSeriesRanks: (s) =>
        uniqueKeys.map((k) => {
          const idx = lastIndexOf.get(k) ?? s.ranks.length - 1;
          return s.ranks[idx] ?? s.ranks.at(-1) ?? 1;
        }),
      stepW: STEP_W[viewMode],
      useViewBox: true,
    };
  }, [viewMode, stepLabels, stepDates, stepRoundKeys]);

  const displayLabels = displayData.labels;
  const nSteps = displayLabels.length;
  const currentStepW = displayData.stepW;
  const plotW = Math.max(600, PAD_L + (nSteps - 1) * currentStepW + PAD_R);

  const xFor = (i: number) => PAD_L + i * currentStepW;

  const selectedSeries = useMemo(
    () => sorted.filter((s) => selected.has(s.userId)),
    [sorted, selected]
  );

  const domainMax = useMemo(() => {
    if (selectedSeries.length === 0) return 2;
    return Math.max(2, ...selectedSeries.flatMap((s) => displayData.getSeriesRanks(s)));
  }, [selectedSeries, displayData]);

  const yFor = (rank: number) =>
    PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * (rank - 1)) / Math.max(1, domainMax - 1);

  const rankLabelArr = useMemo(() => {
    const s = new Set<number>([1, domainMax]);
    for (let r = 5; r < domainMax; r += 5) s.add(r);
    return [...s].sort((a, b) => a - b);
  }, [domainMax]);

  const meSeries = currentUserId
    ? (series.find((s) => s.userId === currentUserId) ?? null)
    : null;
  const meIsSelected = currentUserId !== null && selected.has(currentUserId);
  const meRanks = meSeries ? displayData.getSeriesRanks(meSeries) : null;
  const meDelta = (() => {
    if (!meRanks || meRanks.length < 2) return 0;
    return meRanks[meRanks.length - 2]! - meRanks[meRanks.length - 1]!;
  })();

  // ── Highlight helpers ───────────────────────────────────────────────────────
  const isHighlighted = (userId: string) =>
    effectiveHighlightId !== null && effectiveHighlightId === userId;
  const isDimmed = (userId: string) =>
    effectiveHighlightId !== null && effectiveHighlightId !== userId;

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

  // ── Preset handlers ─────────────────────────────────────────────────────────
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

  // ── Button style helpers (theme-aware) ──────────────────────────────────────
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

  // ── Download ────────────────────────────────────────────────────────────────
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
      subtitle:
        viewMode === "round"
          ? t("trajectoryViewByRound")
          : viewMode === "day"
          ? t("trajectoryViewByDay")
          : t("trajectoryViewByMatch"),
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
    selectedSeries, displayData, meSeries, meIsSelected, displayLabels,
    viewMode, currentUserId, colorMap, domainMax, rankLabelArr, meDelta,
    currentStepW, t,
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

  // ── Hover info overlay (HTML, always stays in visible area) ─────────────────
  const highlightedSeries =
    effectiveHighlightId && selected.has(effectiveHighlightId)
      ? selectedSeries.find((s) => s.userId === effectiveHighlightId) ?? null
      : null;

  // ── Header ──────────────────────────────────────────────────────────────────
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
      <div>
        <h2 className="dark:text-foreground text-lg font-bold text-[#1A2855]">
          {t("trajectoryTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("trajectorySubtitle")}</p>
      </div>
      <div className="flex items-center gap-1.5">
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
          : { display: "flex", flexDirection: "column", gap: 12 }
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
          {/* ── Control bar ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
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
            {/* Chart */}
            <div className="min-w-0 flex-1">
              <div
                style={{
                  background: NAVY_DEEP,
                  borderRadius: 12,
                  border: `1px solid ${GOLD}33`,
                  padding: "14px 0 12px 0",
                  position: "relative", // anchor for the hover overlay
                }}
              >
                {/* Hover / pin name overlay — always visible, top-right corner */}
                {highlightedSeries && (() => {
                  const s = highlightedSeries;
                  const ranks = displayData.getSeriesRanks(s);
                  const lr = ranks.at(-1) ?? 1;
                  const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
                  const isPinned = pinnedId === s.userId;
                  return (
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        background: NAVY,
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
                      <span style={{ color: CREAM, opacity: 0.55, fontWeight: 400, fontSize: 11 }}>
                        {lr}º
                      </span>
                      {s.displayName}
                      {isPinned && (
                        <Pin
                          size={11}
                          style={{ color: GOLD, flexShrink: 0 }}
                        />
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  {/* Fixed rank gutter */}
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

                  {/* Scrollable plot */}
                  <div
                    style={{
                      overflowX: displayData.useViewBox ? "hidden" : "auto",
                      flexGrow: 1,
                    }}
                  >
                    <svg
                      width={displayData.useViewBox ? "100%" : plotW}
                      height={VBH}
                      viewBox={displayData.useViewBox ? `0 0 ${plotW} ${VBH}` : undefined}
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
                          key={`rl-${r}`}
                          x1={0} y1={yFor(r)} x2={plotW} y2={yFor(r)}
                          stroke={CREAM} strokeOpacity="0.06"
                        />
                      ))}

                      {/* X-axis ticks + labels */}
                      {displayLabels.map((label, i) => {
                        const x = xFor(i);
                        const last = i === nSteps - 1;
                        return (
                          <g key={`step-${i}`}>
                            <line
                              x1={x} y1={PLOT_TOP - 8} x2={x} y2={PLOT_BOTTOM + 8}
                              stroke={CREAM} strokeOpacity="0.05"
                            />
                            <text
                              x={x} y={PLOT_TOP - 14}
                              fill={last ? GOLD : CREAM}
                              fillOpacity={last ? 1 : 0.6}
                              fontSize="9"
                              fontWeight={last ? "700" : "500"}
                              textAnchor="end"
                              transform={`rotate(-50, ${x}, ${PLOT_TOP - 14})`}
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}

                      {/* ── Other-player lines ──────────────────────────── */}
                      {selectedSeries
                        .filter((s) => s.userId !== currentUserId)
                        .map((s) => {
                          const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
                          const hl = isHighlighted(s.userId);
                          const dm = isDimmed(s.userId);
                          const ranks = displayData.getSeriesRanks(s);
                          const pts = ranks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ");
                          const lr = ranks.at(-1);
                          return (
                            <g key={s.userId}>
                              {/* Visible line */}
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
                              {/* End dot */}
                              {lr !== undefined && (
                                <circle
                                  cx={xFor(nSteps - 1)} cy={yFor(lr)}
                                  r={hl ? 5 : 3}
                                  fill={color}
                                  fillOpacity={dm ? 0.12 : 1}
                                  style={{ pointerEvents: "none" }}
                                />
                              )}
                              {/* Initials label when few lines shown */}
                              {selected.size <= 12 && lr !== undefined && (
                                <text
                                  x={xFor(nSteps - 1) + 8} y={yFor(lr) + 4}
                                  fill={color} fillOpacity={dm ? 0.12 : 0.85}
                                  fontSize="9" fontWeight="600"
                                  style={{ pointerEvents: "none" }}
                                >
                                  {initials(s.displayName)}
                                </text>
                              )}
                              {/* Wide transparent hitbox for hover/click */}
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

                      {/* ── Me — gold, always on top ──────────────────────── */}
                      {meSeries && meIsSelected && meRanks && (
                        <g>
                          {/* Glow */}
                          <polyline
                            points={meRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ")}
                            fill="none" stroke={GOLD} strokeWidth={8} strokeOpacity={0.14}
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{ pointerEvents: "none" }}
                          />
                          {/* Main line */}
                          <polyline
                            points={meRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ")}
                            fill="none" stroke="url(#trajMe)" strokeWidth={4}
                            strokeOpacity={isDimmed(currentUserId!) ? 0.15 : 1}
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{ pointerEvents: "none" }}
                          >
                            <title>{t("trajectoryYou")}</title>
                          </polyline>
                          {/* Waypoints */}
                          {meRanks.slice(0, -1).map((r, i) => (
                            <circle
                              key={`me-wp-${i}`}
                              cx={xFor(i)} cy={yFor(r)} r="3"
                              fill={NAVY} stroke={GOLD_LIGHT} strokeWidth="1.8"
                              style={{ pointerEvents: "none" }}
                            />
                          ))}
                          {/* End circle */}
                          <circle
                            cx={xFor(nSteps - 1)} cy={yFor(meRanks.at(-1)!)} r={14}
                            fill={GOLD} style={{ pointerEvents: "none" }}
                          />
                          <circle
                            cx={xFor(nSteps - 1)} cy={yFor(meRanks.at(-1)!)} r={14}
                            fill="none" stroke={CREAM} strokeWidth="1.5"
                            style={{ pointerEvents: "none" }}
                          />
                          <text
                            x={xFor(nSteps - 1)} y={yFor(meRanks.at(-1)!) + 4.5}
                            fill={NAVY} fontSize="11" fontWeight="800" textAnchor="middle"
                            style={{ pointerEvents: "none" }}
                          >
                            {t("trajectoryYou")}
                          </text>
                          {/* Delta pill */}
                          {meDelta !== 0 && (
                            <g
                              transform={`translate(${xFor(nSteps - 1) + 16},${yFor(meRanks.at(-1)!) - 22})`}
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
                          {/* Hitbox for me */}
                          <polyline
                            points={meRanks.map((r, i) => `${xFor(i)},${yFor(r)}`).join(" ")}
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
              </div>
            </div>

            {/* ── Side panel ───────────────────────────────────────────────── */}
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
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${GOLD}22` }}>
                  <p
                    style={{
                      color: CREAM, fontSize: 11, fontWeight: 600,
                      letterSpacing: "0.05em", textTransform: "uppercase",
                      marginBottom: 8, opacity: 0.7,
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
                          background: `${GOLD}1A`, border: `1px solid ${GOLD}44`,
                          borderRadius: 6, color: GOLD_LIGHT,
                          fontSize: 11, fontWeight: 600, padding: "3px 8px", cursor: "pointer",
                        }}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Player list */}
                <div style={{ maxHeight: 324, overflowY: "auto", padding: 4 }}>
                  {sorted.map((s) => {
                    const isMe = s.userId === currentUserId;
                    const isSel = selected.has(s.userId);
                    const isPinned = pinnedId === s.userId;
                    const color = colorMap.get(s.userId) ?? OTHER_FALLBACK;
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
                          gap: 8,
                          width: "100%",
                          padding: "5px 8px",
                          borderRadius: 8,
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
                            width: 9, height: 9, borderRadius: "50%",
                            background: color, flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", fontSize: 12,
                            color: isMe ? GOLD : CREAM, fontWeight: isMe ? 700 : 400,
                          }}
                        >
                          {s.displayName}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 10, color: CREAM, opacity: 0.5 }}>
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
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {t("trajectoryFootnote", { count: playerCount })}
      </p>
    </section>
  );
}
