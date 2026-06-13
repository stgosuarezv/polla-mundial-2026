"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MatchStatsCard } from "@/components/scoreboard/match-stats-card";
import type { MatchPredictionSummary } from "@/lib/scoring/prediction-summary";

interface MatchStatsDialogProps {
  homeCode: string;
  awayCode: string;
  summary: MatchPredictionSummary;
}

/**
 * Small "Stats" button that opens a modal dialog showing the prediction stats
 * for this match. Only rendered for locked-round matches where stats are
 * available (RLS constraint — callers must check before rendering this).
 */
export function MatchStatsDialog({
  homeCode,
  awayCode,
  summary,
}: MatchStatsDialogProps) {
  const tPred = useTranslations("predictions");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {tPred("stats")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {homeCode} – {awayCode}
          </DialogTitle>
        </DialogHeader>
        {/* MatchStatsCard without kickoffLabel — the dialog title already
            identifies the match */}
        <MatchStatsCard
          homeCode={homeCode}
          awayCode={awayCode}
          summary={summary}
        />
      </DialogContent>
    </Dialog>
  );
}
