"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CalzometroPair } from "@/lib/scoring/calzometro";

// Quoted group-chat content — stays in Spanish in every locale.
const EPIGRAPH = "«Brigido el calzón paralelo que se mandaron los líderes»";
const EPIGRAPH_AUTHOR = "— Alberto, 2026";

export function CalzonDialog({
  pair,
  roundLabel,
}: {
  pair: CalzometroPair;
  roundLabel: string;
}) {
  const t = useTranslations("scoreboard");

  return (
    <Dialog>
      <DialogTrigger className="bg-background hover:border-foreground/30 hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{pair.userAName}</span>
          <span aria-hidden>🩲</span>
          <span className="truncate font-medium">{pair.userBName}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {t("calzometroEqualCount", {
            equal: pair.equalCount,
            both: pair.bothCount,
          })}
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pair.userAName} 🩲 {pair.userBName}
          </DialogTitle>
          <DialogDescription>
            {t("calzonDialogSubtitle", {
              equal: pair.equalCount,
              both: pair.bothCount,
              round: roundLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm italic">
          {EPIGRAPH}
          <footer className="mt-0.5 text-xs not-italic">
            {EPIGRAPH_AUTHOR}
          </footer>
        </blockquote>

        <div className="max-h-[60dvh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_auto_1.25rem] items-center gap-x-3 gap-y-1 text-sm tabular-nums">
            <span />
            <span className="text-muted-foreground max-w-20 truncate text-xs font-medium">
              {pair.userAName}
            </span>
            <span className="text-muted-foreground max-w-20 truncate text-xs font-medium">
              {pair.userBName}
            </span>
            <span />
            {pair.rows.map((row) => (
              <div key={row.matchId} className="contents">
                <span className="text-muted-foreground">{row.label}</span>
                <span>{row.pickA ?? "—"}</span>
                <span>{row.pickB ?? "—"}</span>
                <span
                  className="text-center font-medium"
                  style={{ color: "var(--color-success)" }}
                >
                  {row.equal ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {t("calzometroFootnote")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
