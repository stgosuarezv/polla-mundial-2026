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
  type WhatIfMatch,
  type WhatIfPredEntry,
  type MatchInput,
} from "@/lib/scoring/what-if";
import type { LeaderboardRow } from "@/lib/scoring/scoring";

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
  kickoffLabel: string;
  roundClosed: boolean;
}

export interface ScoreboardTableProps {
  rows: LeaderboardRow[];
  currentUserId: string | null;
  locale: string;
  prizes: readonly number[];
  // Last-match column
  lastMatchPts: Record<string, number>;
  showLastMatch: boolean;
  // Next-match preview columns
  nextMatches: NextMatchCol[];
  nextPredByKey: Record<string, { home: number; away: number }>;
  // Completion / podio status columns
  completionByUser: Record<string, { made: number; total: number; podioSlots: number }>;
  // What-if data (empty arrays/objects → no simulator shown)
  whatIfMatches: WhatIfMatch[];
  predByKey: Record<string, WhatIfPredEntry>;
  realPtsByKey: Record<string, number>;
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
  nextMatches,
  nextPredByKey,
  completionByUser,
  whatIfMatches,
  predByKey,
  realPtsByKey,
}: ScoreboardTableProps) {
  const t = useTranslations("scoreboard");

  // ── State ──────────────────────────────────────────────────────────────────

  const [simulating, setSimulating] = useState(false);
  const [showStatusCols, setShowStatusCols] = useState(false);
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
        ? projectStandings(rows, whatIfMatches, inputs, predByKey, realPtsByKey)
        : { projected: rows, gainByUserId: new Map<string, number>(), anyChange: false },
    [simulating, rows, whatIfMatches, inputs, predByKey, realPtsByKey]
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
        <div className="lg:hidden rounded-lg border p-3 space-y-2">
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
          <div className="hidden lg:block lg:w-80 lg:shrink-0 lg:sticky lg:top-4 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border p-4">
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
                  {simulating && (
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground w-10" />
                  )}
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("player")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {t("points")}
                  </th>
                  {simulating && (
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
                  {showLastMatch && (
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground leading-tight">
                      <div>Pts</div>
                      <div>{t("lastMatchLabel")}</div>
                    </th>
                  )}
                  {nextMatches.map((m) => (
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
                  ))}
                  <th
                    data-status-col=""
                    className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t("completion")}
                  </th>
                  <th
                    data-status-col=""
                    className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
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

                      {/* Movement arrow (simulating only) */}
                      {simulating && (
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
                      )}

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

                      {/* Gain (simulating only) */}
                      {simulating && (
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
                      )}

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

                      {/* Last-match points (static — historical) */}
                      {showLastMatch && (
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {lastMatchPts[row.userId] !== undefined
                            ? lastMatchPts[row.userId]
                            : "—"}
                        </td>
                      )}

                      {/* Next-match prediction preview columns */}
                      {nextMatches.map((m) => {
                        const pred = m.roundClosed
                          ? nextPredByKey[`${row.userId}:${m.id}`]
                          : undefined;
                        return (
                          <td
                            key={m.id}
                            className="px-3 py-2.5 text-center text-muted-foreground whitespace-nowrap"
                          >
                            {pred ? `${pred.home}–${pred.away}` : "—"}
                          </td>
                        );
                      })}

                      {/* Completion status (data-status-col) */}
                      <td
                        data-status-col=""
                        className="px-3 py-2.5 text-center"
                      >
                        {(() => {
                          const c = completionByUser[row.userId];
                          if (!c || c.total === 0)
                            return (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            );
                          const state = statusOf(c.made, c.total);
                          return (
                            <StatusBadge
                              state={state}
                              label={t(STATUS_KEY[state])}
                            />
                          );
                        })()}
                      </td>

                      {/* Podio status (data-status-col) */}
                      <td
                        data-status-col=""
                        className="px-3 py-2.5 text-center"
                      >
                        {(() => {
                          const c = completionByUser[row.userId];
                          const slots = c?.podioSlots ?? 0;
                          const state = statusOf(slots, 3);
                          return (
                            <StatusBadge
                              state={state}
                              label={t(STATUS_KEY[state])}
                            />
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Last-match footnote */}
          {showLastMatch && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              {t("lastMatchFootnote")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
