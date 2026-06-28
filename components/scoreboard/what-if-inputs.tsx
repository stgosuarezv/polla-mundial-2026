"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreInput } from "@/components/predictions/score-input";
import type { WhatIfMatch, MatchInput } from "@/lib/scoring/what-if";

interface WhatIfInputsProps {
  matches: WhatIfMatch[];
  inputs: Record<string, MatchInput>;
  onChange: (matchId: string, patch: Partial<MatchInput>) => void;
  onClear: () => void;
}

/**
 * Controlled panel of score inputs for the "What if?" simulator.
 * Matches are grouped by round; rounds where every match is finished
 * are collapsed by default (same convention as the Predictions page).
 */
export function WhatIfInputs({
  matches,
  inputs,
  onChange,
  onClear,
}: WhatIfInputsProps) {
  const t = useTranslations("scoreboard");
  const tPred = useTranslations("predictions");
  const tRounds = useTranslations("rounds");

  // Group matches by round, preserving round order
  const roundGroups = useMemo(() => {
    const map = new Map<
      string,
      { roundKey: string; orderIndex: number; matches: WhatIfMatch[] }
    >();
    for (const m of matches) {
      const group = map.get(m.roundId) ?? {
        roundKey: m.roundKey,
        orderIndex: m.roundOrderIndex,
        matches: [],
      };
      group.matches.push(m);
      map.set(m.roundId, group);
    }
    return [...map.values()].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [matches]);

  return (
    <div className="space-y-3">
      {/* Description + Clear */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("whatIfDescription")}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
        >
          {t("whatIfClear")}
        </button>
      </div>

      {/* Round groups */}
      <div className="space-y-1">
        {roundGroups.map((group) => {
          const allFinished = group.matches.every(
            (m) => m.status === "finished"
          );

          return (
            <details
              key={group.roundKey}
              open={!allFinished}
              className="group/round"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-1.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {tRounds(group.roundKey as Parameters<typeof tRounds>[0])}
                </span>
                <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground -rotate-90 transition-transform group-open/round:rotate-0" />
              </summary>

              <div className="space-y-3 pl-1 pt-2 pb-3">
                {group.matches.map((m) => {
                  const inp = inputs[m.id]!;
                  const homeVal = inp.home !== "" ? Number(inp.home) : null;
                  const awayVal = inp.away !== "" ? Number(inp.away) : null;
                  const showAdvancePicker =
                    m.stage === "knockout" &&
                    homeVal !== null &&
                    awayVal !== null &&
                    homeVal === awayVal;
                  const isFinished = m.status === "finished";

                  return (
                    <div key={m.id} className="space-y-1.5">
                      {/* Kickoff timestamp + locked badge */}
                      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                        {m.kickoffLabel}
                        {isFinished && (
                          <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                            {tPred("locked")}
                          </span>
                        )}
                      </p>

                      {/* Score inputs row */}
                      <div className="flex items-center gap-2 flex-nowrap">
                        <span className="text-sm font-medium w-14 text-right leading-none">
                          {m.homeCode}
                        </span>
                        <ScoreInput
                          value={inp.home}
                          onChange={(v) => onChange(m.id, { home: v })}
                        />
                        <span className="text-sm font-bold text-muted-foreground">
                          –
                        </span>
                        <ScoreInput
                          value={inp.away}
                          onChange={(v) => onChange(m.id, { away: v })}
                        />
                        <span className="text-sm font-medium w-14 leading-none">
                          {m.awayCode}
                        </span>
                      </div>

                      {/* Knockout draw → who advances? */}
                      {showAdvancePicker && (
                        <div className="pl-16">
                          <p className="text-xs text-muted-foreground mb-1">
                            {tPred("penaltyWinner")}
                          </p>
                          <div className="flex gap-2">
                            {[
                              { id: m.homeTeamId, code: m.homeCode },
                              { id: m.awayTeamId, code: m.awayCode },
                            ].map((team) => (
                              <button
                                key={team.id ?? team.code}
                                type="button"
                                onClick={() =>
                                  onChange(m.id, {
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
            </details>
          );
        })}
      </div>
    </div>
  );
}
