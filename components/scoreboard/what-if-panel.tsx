"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ScoreInput } from "@/components/predictions/score-input";
import {
  scorePrediction,
  rankEntries,
  type LeaderboardRow,
  type Stage,
} from "@/lib/scoring/scoring";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WhatIfMatch {
  id: string;
  stage: Stage;
  status: string; // "finished" | "scheduled" | "in_progress"
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffLabel: string;
  actual: {
    home: number;
    away: number;
    advancingTeamId: string | null;
  } | null;
}

export interface WhatIfPredEntry {
  home: number;
  away: number;
  penaltyWinnerId: string | null;
}

interface MatchInput {
  home: string | number;
  away: string | number;
  advancingTeamId: string;
}

// Build the default inputs: finished matches pre-fill with actual result;
// upcoming start blank.
function buildDefaultInputs(
  matches: WhatIfMatch[]
): Record<string, MatchInput> {
  const defaults: Record<string, MatchInput> = {};
  for (const m of matches) {
    if (m.status === "finished" && m.actual) {
      defaults[m.id] = {
        home: m.actual.home,
        away: m.actual.away,
        advancingTeamId: m.actual.advancingTeamId ?? "",
      };
    } else {
      defaults[m.id] = { home: "", away: "", advancingTeamId: "" };
    }
  }
  return defaults;
}

// ── WhatIfPanel ────────────────────────────────────────────────────────────────

export function WhatIfPanel({
  baseline,
  matches,
  predByKey,
  realPtsByKey,
  currentUserId,
}: {
  baseline: LeaderboardRow[];
  matches: WhatIfMatch[];
  predByKey: Record<string, WhatIfPredEntry>;
  realPtsByKey: Record<string, number>;
  currentUserId: string | null;
}) {
  const t = useTranslations("scoreboard");
  const tPred = useTranslations("predictions");

  const defaultInputs = useMemo(() => buildDefaultInputs(matches), [matches]);
  const [inputs, setInputs] =
    useState<Record<string, MatchInput>>(defaultInputs);

  function setMatchInput(matchId: string, patch: Partial<MatchInput>) {
    setInputs((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId]!, ...patch },
    }));
  }

  function handleClear() {
    setInputs(buildDefaultInputs(matches));
  }

  // ── Projection ──────────────────────────────────────────────────────────────
  // For each baseline player, compute the delta contributed by each match that
  // has a complete hypothetical score entered, then re-rank.

  const { projected, gainByUserId, anyChange } = useMemo(() => {
    // Per-player mutable aggregates starting from real standings
    const agg = new Map(
      baseline.map((r) => [
        r.userId,
        {
          userId: r.userId,
          displayName: r.displayName,
          total: r.totalPoints,
          hit: r.matchesHit,
          zero: r.zeroMatches,
          gain: 0,
        },
      ])
    );

    let anyChange = false;

    for (const m of matches) {
      const inp = inputs[m.id];
      const homeStr = inp?.home;
      const awayStr = inp?.away;
      const homeVal =
        homeStr !== "" && homeStr !== undefined ? Number(homeStr) : null;
      const awayVal =
        awayStr !== "" && awayStr !== undefined ? Number(awayStr) : null;
      const hasScore = homeVal !== null && awayVal !== null;

      const max = m.stage === "group" ? 10 : 25;

      // Determine if a knockout draw scenario needs advance info
      const enteredDraw =
        hasScore && m.stage === "knockout" && homeVal === awayVal;
      const advancingTeamId = enteredDraw
        ? inp?.advancingTeamId || null
        : null;

      for (const [userId, entry] of agg) {
        // Baseline contribution for this match
        const baseKey = `${userId}:${m.id}`;
        const basePts =
          m.status === "finished" ? (realPtsByKey[baseKey] ?? 0) : 0;
        const baseIsHit = m.status === "finished" && basePts === max;
        const baseIsZero = m.status === "finished" && basePts === 0;

        if (!hasScore) {
          // Upcoming with no score entered: no change vs baseline
          continue;
        }

        // Simulated actual
        const predKey = `${userId}:${m.id}`;
        const pred = predByKey[predKey] ?? null;

        // Determine advancing team for non-draw knockouts
        let simAdvancingTeamId: string | null = null;
        if (m.stage === "knockout") {
          if (homeVal! > awayVal!) {
            simAdvancingTeamId = m.homeTeamId;
          } else if (awayVal! > homeVal!) {
            simAdvancingTeamId = m.awayTeamId;
          } else {
            // Draw: use whatever the user picked
            simAdvancingTeamId = advancingTeamId;
          }
        }

        const breakdown = scorePrediction(
          pred
            ? {
                home_score_pred: pred.home,
                away_score_pred: pred.away,
                penalty_winner_team_id: pred.penaltyWinnerId,
              }
            : null,
          {
            home_score: homeVal,
            away_score: awayVal,
            home_team_id: m.homeTeamId,
            away_team_id: m.awayTeamId,
            advancing_team_id: simAdvancingTeamId,
            penalty_winner_team_id: simAdvancingTeamId,
          },
          m.stage
        );
        const simPts = breakdown.total;
        const simIsHit = simPts === max;
        const simIsZero = simPts === 0;

        const delta = simPts - basePts;
        const hitDelta = (simIsHit ? 1 : 0) - (baseIsHit ? 1 : 0);
        const zeroDelta = (simIsZero ? 1 : 0) - (baseIsZero ? 1 : 0);

        if (delta !== 0 || hitDelta !== 0 || zeroDelta !== 0) {
          anyChange = true;
          entry.total += delta;
          entry.hit += hitDelta;
          entry.zero += zeroDelta;
          entry.gain += delta;
        }
      }
    }

    const entries = [...agg.values()];
    const projected = rankEntries(entries);
    const gainByUserId = new Map(entries.map((e) => [e.userId, e.gain]));

    return { projected, gainByUserId, anyChange };
  }, [baseline, matches, inputs, predByKey, realPtsByKey]);

  // Build a map of baseline rank by userId for movement arrows
  const baselineRankByUser = useMemo(
    () => new Map(baseline.map((r) => [r.userId, r.rank])),
    [baseline]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#1A2855] dark:text-foreground">
            {t("whatIfTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("whatIfDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
        >
          {t("whatIfClear")}
        </button>
      </div>

      {/* Match inputs */}
      <div className="space-y-3">
        {matches.map((m) => {
          const inp = inputs[m.id]!;
          const homeVal =
            inp.home !== "" ? Number(inp.home) : null;
          const awayVal =
            inp.away !== "" ? Number(inp.away) : null;
          const showAdvancePicker =
            m.stage === "knockout" &&
            homeVal !== null &&
            awayVal !== null &&
            homeVal === awayVal;
          const isFinished = m.status === "finished";

          return (
            <div key={m.id} className="space-y-1.5">
              {/* Kickoff label */}
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                {m.kickoffLabel}
                {isFinished && (
                  <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                    {tPred("locked")}
                  </span>
                )}
              </p>
              {/* Score row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium w-14 text-right leading-none">
                  {m.homeCode}
                </span>
                <ScoreInput
                  value={inp.home}
                  onChange={(v) => setMatchInput(m.id, { home: v })}
                />
                <span className="text-sm font-bold text-muted-foreground">
                  –
                </span>
                <ScoreInput
                  value={inp.away}
                  onChange={(v) => setMatchInput(m.id, { away: v })}
                />
                <span className="text-sm font-medium w-14 leading-none">
                  {m.awayCode}
                </span>
              </div>
              {/* Knockout draw: advance picker */}
              {showAdvancePicker && (
                <div className="pl-16">
                  <p className="text-xs text-muted-foreground mb-1">
                    {tPred("penaltyWinner")}
                  </p>
                  <div className="flex gap-2">
                    {[
                      { id: m.homeTeamId, code: m.homeCode, name: m.homeName },
                      { id: m.awayTeamId, code: m.awayCode, name: m.awayName },
                    ].map((team) => (
                      <button
                        key={team.id ?? team.code}
                        type="button"
                        onClick={() =>
                          setMatchInput(m.id, {
                            advancingTeamId: team.id ?? "",
                          })
                        }
                        className={cn(
                          "rounded border px-3 py-1 text-xs font-medium transition-colors",
                          inp.advancingTeamId === team.id
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background hover:border-primary"
                        )}
                      >
                        {team.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Projected standings */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {t("whatIfProjected")}
        </h3>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {projected.map((row) => {
                const baseRank = baselineRankByUser.get(row.userId) ?? row.rank;
                const rankDelta = baseRank - row.rank; // positive = moved up
                const gain = gainByUserId.get(row.userId) ?? 0;
                const isMe = row.userId === currentUserId;

                return (
                  <tr
                    key={row.userId}
                    className={cn(
                      "transition-colors",
                      isMe && "bg-highlight/10 font-semibold"
                    )}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2 w-8 text-muted-foreground tabular-nums">
                      {row.rank}
                    </td>
                    {/* Movement arrow */}
                    <td className="px-1 py-2 w-8 text-center">
                      {anyChange && rankDelta !== 0 ? (
                        <span
                          className={cn(
                            "text-xs font-bold",
                            rankDelta > 0
                              ? "text-green-600"
                              : "text-red-500"
                          )}
                        >
                          {rankDelta > 0
                            ? `↑${rankDelta}`
                            : `↓${Math.abs(rankDelta)}`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </td>
                    {/* Player name */}
                    <td className="px-2 py-2">
                      {row.displayName}
                    </td>
                    {/* Projected points */}
                    <td className="px-3 py-2 text-right font-bold text-primary tabular-nums">
                      {row.totalPoints}
                    </td>
                    {/* Net gain */}
                    <td className="px-3 py-2 text-right tabular-nums w-16">
                      {gain !== 0 ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            gain > 0
                              ? "text-green-600"
                              : "text-red-500"
                          )}
                        >
                          {gain > 0 ? `+${gain}` : gain}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
