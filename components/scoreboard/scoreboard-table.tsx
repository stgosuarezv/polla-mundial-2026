"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WhatIfInputs } from "@/components/scoreboard/what-if-inputs";
import {
  buildDefaultInputs,
  projectStandings,
  isMatchInputComplete,
  type WhatIfMatch,
  type WhatIfPredEntry,
  type MatchInput,
} from "@/lib/scoring/what-if";
import type { LeaderboardRow, PodioPrediction } from "@/lib/scoring/scoring";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCLP(locale: string, amount: number): string {
  const tag = locale === "es" ? "es-CL" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type CompletionState = "complete" | "partial" | "empty";

function statusOf(made: number, total: number): CompletionState {
  if (total === 0 || made === 0) return "empty";
  if (made >= total) return "complete";
  return "partial";
}

const STATUS_KEY = {
  complete: "statusComplete",
  partial: "statusPartial",
  empty: "statusEmpty",
} as const;

function StatusBadge({
  state,
  label,
}: {
  state: CompletionState;
  label: string;
}) {
  if (state === "complete")
    return (
      <span className="text-xs font-medium" style={{ color: "#16a34a" }}>
        {label}
      </span>
    );
  if (state === "partial")
    return (
      <span className="text-xs font-medium" style={{ color: "#d97706" }}>
        {label}
      </span>
    );
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

/** Tie-aware prize allocation: players sharing a rank split the combined pot. */
function computePrizes(
  displayedRows: LeaderboardRow[],
  prizes: readonly number[]
): Map<number, number> {
  const prizeByRank = new Map<number, number>();
  for (let i = 0; i < displayedRows.length; ) {
    const rank = displayedRows[i]!.rank;
    let j = i;
    while (j < displayedRows.length && displayedRows[j]!.rank === rank) j++;
    const groupSize = j - i;
    let pot = 0;
    for (let k = 0; k < groupSize; k++) {
      pot += prizes[rank - 1 + k] ?? 0;
    }
    if (pot > 0) prizeByRank.set(rank, Math.round(pot / groupSize));
    i = j;
  }
  return prizeByRank;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NextMatchCol {
  id: string;
  homeCode: string;
  awayCode: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffLabel: string;
  roundClosed: boolean;
}

export interface PodioCell {
  code: string;
  flagUrl: string | null;
}

export interface PodioCells {
  first: PodioCell | null;
  second: PodioCell | null;
  third: PodioCell | null;
}

export interface ScoreboardTableProps {
  rows: LeaderboardRow[];
  currentUserId: string | null;
  locale: string;
  prizes: readonly number[];
  // Last-match column
  lastMatchPts: Record<string, number>;
  showLastMatch: boolean;
  // Rank before the last batch of matches (for movement arrows in normal mode)
  prevRankByUser: Record<string, number>;
  // Next-match preview columns
  nextMatches: NextMatchCol[];
  nextPredByKey: Record<string, { home: number; away: number; penaltyWinnerId: string | null }>;
  // Completion / podio status columns
  completionByUser: Record<string, { made: number; total: number; podioSlots: number }>;
  // Podium (1st/2nd/3rd place) pick columns — only meaningful once podioLocked
  podioByUser: Record<string, PodioCells>;
  podioLocked: boolean;
  // What-if data (empty arrays/objects → no simulator shown)
  whatIfMatches: WhatIfMatch[];
  predByKey: Record<string, WhatIfPredEntry>;
  realPtsByKey: Record<string, number>;
  // Podium bonus projection: each player's podium pick + already-awarded
  // podio points (baseline), so simulating the Final/3rd-place projects the
  // podium bonus as a delta. Empty objects when podioLocked is false.
  podioPredByUser: Record<string, PodioPrediction>;
  realPodioPtsByUser: Record<string, number>;
}

// Amber palette (inline — Tailwind arbitrary values unreliable in Turbopack)
const AMBER_BORDER = "#f59e0b";
const AMBER_BG = "rgba(245, 158, 11, 0.08)";

// ── ScoreboardTable ────────────────────────────────────────────────────────────

export function ScoreboardTable({
  rows,
  currentUserId,
  locale,
  prizes,
  lastMatchPts,
  showLastMatch,
  prevRankByUser,
  nextMatches,
  nextPredByKey,
  completionByUser,
  podioByUser,
  podioLocked,
  whatIfMatches,
  predByKey,
  realPtsByKey,
  podioPredByUser,
  realPodioPtsByUser,
}: ScoreboardTableProps) {
  const t = useTranslations("scoreboard");
  // Podium slot labels ("champion"/"runnerUp"/"thirdPlace") already exist in
  // the profile namespace (profile/[userId] podium section) — reuse them for
  // the podium column header tooltips instead of duplicating the strings.
  const tProfile = useTranslations("profile");

  // ── State ──────────────────────────────────────────────────────────────────

  const [simulating, setSimulating] = useState(false);
  const [showStatusCols, setShowStatusCols] = useState(false);
  const [showPodioCols, setShowPodioCols] = useState(true);
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);

  const defaultInputs = useMemo(
    () => buildDefaultInputs(whatIfMatches),
    [whatIfMatches]
  );
  const [inputs, setInputs] = useState<Record<string, MatchInput>>(defaultInputs);

  function setMatchInput(matchId: string, patch: Partial<MatchInput>) {
    setInputs((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId]!, ...patch },
    }));
  }

  function handleClear() {
    setInputs(buildDefaultInputs(whatIfMatches));
  }

  function handleToggleSimulating() {
    setSimulating((s) => {
      if (s) {
        // Turning off → reset inputs so next activation starts fresh
        setInputs(buildDefaultInputs(whatIfMatches));
        setMobileInputsOpen(false);
      }
      return !s;
    });
  }

  // ── Projection ─────────────────────────────────────────────────────────────

  const { projected, gainByUserId, anyChange } = useMemo(
    () =>
      simulating
        ? projectStandings(
            rows,
            whatIfMatches,
            inputs,
            predByKey,
            realPtsByKey,
            podioPredByUser,
            realPodioPtsByUser
          )
        : { projected: rows, gainByUserId: new Map<string, number>(), anyChange: false },
    [
      simulating,
      rows,
      whatIfMatches,
      inputs,
      predByKey,
      realPtsByKey,
      podioPredByUser,
      realPodioPtsByUser,
    ]
  );

  const displayedRows = simulating ? projected : rows;

  const baselineRankByUser = useMemo(
    () => new Map(rows.map((r) => [r.userId, r.rank])),
    [rows]
  );

  const prizeByRank = useMemo(
    () => computePrizes(displayedRows, prizes),
    [displayedRows, prizes]
  );

  const hasWhatIf = whatIfMatches.length > 0;

  // Show real rank-change arrows in normal mode when we have previous-rank data
  const hasPrevRanks = showLastMatch && Object.keys(prevRankByUser).length > 0;

  // When simulating, show up to the next 4 what-if matches that are not yet
  // complete — i.e. either score box is still blank. Uses the shared
  // isMatchInputComplete predicate so this check stays in sync with the
  // projection logic. whatIfMatches is already ordered by kickoff ascending.
  const nextUnsimulatedMatches = simulating
    ? whatIfMatches.filter((m) => !isMatchInputComplete(inputs[m.id])).slice(0, 4)
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Controls row: simulate toggle + status-columns toggle */}
      <div className="flex justify-end items-center gap-2 print:hidden flex-wrap">
        {hasWhatIf && (
          <Button
            size="sm"
            variant={simulating ? "default" : "outline"}
            onClick={handleToggleSimulating}
            aria-pressed={simulating}
          >
            {t("whatIfTitle")}
          </Button>
        )}
        {podioLocked && (
          <Button
            size="sm"
            variant={showPodioCols ? "default" : "outline"}
            onClick={() => setShowPodioCols((s) => !s)}
            aria-pressed={showPodioCols}
          >
            {t("togglePodiumColumns")}
          </Button>
        )}
        <Button
          size="sm"
          variant={showStatusCols ? "default" : "outline"}
          onClick={() => setShowStatusCols((s) => !s)}
          aria-pressed={showStatusCols}
        >
          {t("toggleStatusColumns")}
        </Button>
      </div>

      {/* Mobile: collapsible inputs panel (only when simulating, hidden on lg+) */}
      {simulating && hasWhatIf && (
        <div className="lg:hidden print:hidden rounded-lg border p-3 space-y-2">
          <button
            type="button"
            onClick={() => setMobileInputsOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm font-medium w-full text-left"
          >
            <span
              className="text-xs"
              style={{ color: AMBER_BORDER }}
              aria-hidden
            >
              {mobileInputsOpen ? "▲" : "▼"}
            </span>
            <span style={{ color: AMBER_BORDER }}>{t("whatIfTitle")}</span>
          </button>
          {mobileInputsOpen && (
            <WhatIfInputs
              matches={whatIfMatches}
              inputs={inputs}
              onChange={setMatchInput}
              onClear={handleClear}
            />
          )}
        </div>
      )}

      {/* Layout: table + optional side inputs (desktop) */}
      <div
        className={cn(
          simulating && hasWhatIf && "lg:flex lg:gap-6 lg:items-start"
        )}
      >
        {/* Desktop side panel */}
        {simulating && hasWhatIf && (
          <div className="hidden lg:block print:hidden lg:w-80 lg:shrink-0 lg:sticky lg:top-4 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border p-4">
            <WhatIfInputs
              matches={whatIfMatches}
              inputs={inputs}
              onChange={setMatchInput}
              onClear={handleClear}
            />
          </div>
        )}

        {/* Table */}
        <div
          className={cn(
            showStatusCols ? undefined : "hide-status-cols",
            showPodioCols ? undefined : "hide-podio-cols",
            "flex-1"
          )}
        >
          <div
            id="scoreboard-table"
            className="overflow-x-auto rounded-lg border"
            style={
              simulating
                ? { borderColor: AMBER_BORDER, backgroundColor: AMBER_BG }
                : undefined
            }
          >
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "rgba(26, 40, 85, 0.07)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("rank")}
                  </th>
                  {/* Movement arrow column — sim mode uses projected rank, normal mode uses prevRank */}
                  {(simulating || hasPrevRanks) && (
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground w-10" />
                  )}
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("player")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("points")}
                  </th>
                  {(simulating || showLastMatch) && (
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-14">
                      +/–
                    </th>
                  )}
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("hits")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("zeros")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("gap")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("prize")}
                  </th>
                  {simulating ? (
                    nextUnsimulatedMatches.map((m) => (
                      <th
                        key={m.id}
                        className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        <div className="text-xs">
                          {m.homeCode}–{m.awayCode}
                        </div>
                        <div className="text-[10px] font-normal text-muted-foreground/70">
                          {m.kickoffLabel}
                        </div>
                      </th>
                    ))
                  ) : (
                    nextMatches.filter((m) => m.roundClosed).map((m) => (
                      <th
                        key={m.id}
                        className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        <div className="text-xs">
                          {m.homeCode}–{m.awayCode}
                        </div>
                        <div className="text-[10px] font-normal text-muted-foreground/70">
                          {m.kickoffLabel}
                        </div>
                      </th>
                    ))
                  )}
                  {podioLocked && (
                    <>
                      <th
                        data-podio-col=""
                        title={tProfile("champion")}
                        className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        🥇
                      </th>
                      <th
                        data-podio-col=""
                        title={tProfile("runnerUp")}
                        className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        🥈
                      </th>
                      <th
                        data-podio-col=""
                        title={tProfile("thirdPlace")}
                        className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        🥉
                      </th>
                    </>
                  )}
                  <th
                    data-status-col=""
                    className="w-14 px-2 py-2 text-center font-medium text-muted-foreground leading-tight"
                  >
                    {t("completion")}
                  </th>
                  <th
                    data-status-col=""
                    className="w-12 px-2 py-2 text-center font-medium text-muted-foreground leading-tight"
                  >
                    {t("podio")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {displayedRows.map((row) => {
                  const isMe = row.userId === currentUserId;
                  const prizeAmount = prizeByRank.get(row.rank);
                  const prize =
                    prizeAmount !== undefined
                      ? formatCLP(locale, prizeAmount)
                      : "—";

                  // Sim-specific values
                  const baseRank = baselineRankByUser.get(row.userId) ?? row.rank;
                  const rankDelta = baseRank - row.rank; // positive = moved up
                  const gain = gainByUserId.get(row.userId) ?? 0;

                  // Normal-mode rank-change arrow (vs. rank before last batch)
                  const prevRank = prevRankByUser[row.userId] ?? row.rank;
                  const realRankDelta = prevRank - row.rank; // positive = moved up

                  return (
                    <tr
                      key={row.userId}
                      className={cn(
                        "transition-colors hover:bg-muted/30",
                        isMe && "font-semibold"
                      )}
                      style={
                        simulating
                          ? { backgroundColor: isMe ? "rgba(245, 158, 11, 0.20)" : undefined }
                          : isMe
                          ? undefined
                          : undefined
                      }
                    >
                      {/* Rank */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.rank === 1
                          ? "🥇"
                          : row.rank === 2
                          ? "🥈"
                          : row.rank === 3
                          ? "🥉"
                          : row.rank}
                      </td>

                      {/* Movement arrow column */}
                      {simulating ? (
                        <td className="px-2 py-2.5 text-center w-10">
                          {anyChange && rankDelta !== 0 ? (
                            <span
                              className="text-xs font-bold"
                              style={{
                                color: rankDelta > 0 ? "#16a34a" : "#dc2626",
                              }}
                            >
                              {rankDelta > 0
                                ? `↑${rankDelta}`
                                : `↓${Math.abs(rankDelta)}`}
                            </span>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "#9ca3af" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ) : hasPrevRanks ? (
                        <td className="px-2 py-2.5 text-center w-10">
                          {realRankDelta !== 0 ? (
                            <span
                              className="text-xs font-bold"
                              style={{
                                color: realRankDelta > 0 ? "#16a34a" : "#dc2626",
                              }}
                            >
                              {realRankDelta > 0
                                ? `↑${realRankDelta}`
                                : `↓${Math.abs(realRankDelta)}`}
                            </span>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "#9ca3af" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ) : null}

                      {/* Player name */}
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/${locale}/profile/${row.userId}`}
                          className="hover:underline"
                        >
                          {row.displayName}
                        </Link>
                        {isMe && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {t("you")}
                          </span>
                        )}
                      </td>

                      {/* Points (projected when simulating) */}
                      <td className="px-3 py-2.5 text-right font-bold text-primary">
                        {row.totalPoints}
                      </td>

                      {/* +/– column: sim gain when simulating, last-match pts otherwise */}
                      {simulating ? (
                        <td className="px-2 py-2.5 text-right w-14">
                          {gain !== 0 ? (
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: gain > 0 ? "#16a34a" : "#dc2626",
                              }}
                            >
                              {gain > 0 ? `+${gain}` : gain}
                            </span>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "#9ca3af" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ) : showLastMatch ? (
                        <td className="px-2 py-2.5 text-right w-14">
                          {(lastMatchPts[row.userId] ?? 0) > 0 ? (
                            <span
                              className="text-xs font-medium"
                              style={{ color: "#16a34a" }}
                            >
                              +{lastMatchPts[row.userId]}
                            </span>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "#9ca3af" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ) : null}

                      {/* Hits */}
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        {row.matchesHit}
                      </td>

                      {/* Zeros */}
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        {row.zeroMatches}
                      </td>

                      {/* Gap */}
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        {row.deltaFromLeader < 0 ? `${row.deltaFromLeader}` : "—"}
                      </td>

                      {/* Prize (recomputed from projected rank when simulating) */}
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right whitespace-nowrap",
                          prizeAmount !== undefined
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {prize}
                      </td>

                      {/* Next-match prediction preview columns */}
                      {simulating ? (
                        nextUnsimulatedMatches.map((m) => (
                          <td
                            key={m.id}
                            className="px-3 py-2.5 text-center text-muted-foreground whitespace-nowrap"
                          >
                            {(() => {
                              const pred = predByKey[`${row.userId}:${m.id}`];
                              if (!pred) return "—";
                              const score = `${pred.home}–${pred.away}`;
                              const winnerCode = pred.penaltyWinnerId
                                ? pred.penaltyWinnerId === m.homeTeamId
                                  ? m.homeCode
                                  : m.awayCode
                                : null;
                              return winnerCode ? `${score} (${winnerCode})` : score;
                            })()}
                          </td>
                        ))
                      ) : (
                        nextMatches.filter((m) => m.roundClosed).map((m) => (
                          <td
                            key={m.id}
                            className="px-3 py-2.5 text-center text-muted-foreground whitespace-nowrap"
                          >
                            {(() => {
                              const pred = nextPredByKey[`${row.userId}:${m.id}`];
                              if (!pred) return "—";
                              const score = `${pred.home}–${pred.away}`;
                              const winnerCode = pred.penaltyWinnerId
                                ? pred.penaltyWinnerId === m.homeTeamId
                                  ? m.homeCode
                                  : m.awayCode
                                : null;
                              return winnerCode ? `${score} (${winnerCode})` : score;
                            })()}
                          </td>
                        ))
                      )}

                      {/* Podium picks (data-podio-col): 1st/2nd/3rd place, flag + code */}
                      {podioLocked && (
                        <>
                          {(["first", "second", "third"] as const).map((slot) => {
                            const cell = podioByUser[row.userId]?.[slot];
                            return (
                              <td
                                key={slot}
                                data-podio-col=""
                                className="px-2 py-2.5 text-center whitespace-nowrap"
                              >
                                {cell ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    {cell.flagUrl && (
                                      <img
                                        src={cell.flagUrl}
                                        alt=""
                                        className="inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover"
                                      />
                                    )}
                                    <span>{cell.code}</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                        </>
                      )}

                      {/* Completion status (data-status-col) */}
                      <td
                        data-status-col=""
                        className="px-2 py-2.5 text-center"
                      >
                        {(() => {
                          const c = completionByUser[row.userId];
                          if (!c || c.total === 0 || c.made === 0)
                            return <span className="text-xs text-muted-foreground">—</span>;
                          if (c.made >= c.total)
                            return <span className="text-xs font-medium" style={{ color: "#16a34a" }}>✓</span>;
                          return <span className="text-xs font-medium" style={{ color: "#d97706" }}>{c.made}/{c.total}</span>;
                        })()}
                      </td>

                      {/* Podio status (data-status-col) */}
                      <td
                        data-status-col=""
                        className="px-2 py-2.5 text-center"
                      >
                        {(() => {
                          const slots = completionByUser[row.userId]?.podioSlots ?? 0;
                          if (slots === 0)
                            return <span className="text-xs text-muted-foreground">—</span>;
                          if (slots >= 3)
                            return <span className="text-xs font-medium" style={{ color: "#16a34a" }}>✓</span>;
                          return <span className="text-xs font-medium" style={{ color: "#d97706" }}>{slots}/3</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
