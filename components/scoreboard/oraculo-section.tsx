"use client";

import { useTranslations } from "next-intl";
import { FunSection } from "@/components/ui/fun-section";
import { oracleConsensus, oracleVerdict } from "@/lib/scoring/oracle";
import type { MatchPredictionSummary } from "@/lib/scoring/prediction-summary";

export interface OracleItem {
  id: string;
  homeCode: string;
  awayCode: string;
  kickoffLabel: string;
  summary: MatchPredictionSummary;
  /** Final score when the match is finished; null while it's still upcoming. */
  result: { home: number; away: number } | null;
}

// Cool, deliberately non-gold palette — gold is reserved for the cash prize.
const BAR = "#5E7BBF";
const BAR_FAVORITE = "#3D5BA9";

const pct = (share: number) => Math.round(share * 100);

function ConsensusBar({
  label,
  share,
  isFavorite,
}: {
  label: string;
  share: number;
  isFavorite: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-14 shrink-0 text-xs">
        {label}
      </span>
      <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct(share)}%`,
            backgroundColor: isFavorite ? BAR_FAVORITE : BAR,
          }}
        />
      </div>
      <span
        className={`w-9 shrink-0 text-right text-xs tabular-nums ${
          isFavorite ? "text-foreground font-semibold" : "text-muted-foreground"
        }`}
      >
        {pct(share)}%
      </span>
    </div>
  );
}

function OracleCard({ item }: { item: OracleItem }) {
  const t = useTranslations("scoreboard");
  const consensus = oracleConsensus(item.summary);

  const favoriteLabel: string =
    consensus.favorite === "home"
      ? item.homeCode
      : consensus.favorite === "away"
        ? item.awayCode
        : t("draw");

  const verdict = item.result
    ? oracleVerdict(consensus.favorite, item.result.home, item.result.away)
    : null;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="dark:text-foreground font-semibold text-[#1A2855]">
          {item.homeCode} – {item.awayCode}
        </span>
        <span className="text-muted-foreground text-xs">
          {item.result ? t("oraclePlayedTag") : t("oracleUpcomingTag")}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {t("oracleFavorite")}
        </span>
        <span className="text-foreground text-sm font-semibold">
          {favoriteLabel} · {pct(consensus.shares[consensus.favorite])}%
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <ConsensusBar
          label={item.homeCode}
          share={consensus.shares.home}
          isFavorite={consensus.favorite === "home"}
        />
        <ConsensusBar
          label={t("draw")}
          share={consensus.shares.draw}
          isFavorite={consensus.favorite === "draw"}
        />
        <ConsensusBar
          label={item.awayCode}
          share={consensus.shares.away}
          isFavorite={consensus.favorite === "away"}
        />
      </div>

      <p className="text-muted-foreground mt-2 text-[11px]">
        {t("oracleVotes", { count: consensus.total })} · {item.kickoffLabel}
      </p>

      {item.result && verdict && (
        <div className="mt-2 flex items-center gap-1.5 border-t pt-2 text-sm">
          <span className="text-foreground font-medium">
            {t("oracleResult")}: {item.result.home}–{item.result.away}
          </span>
          <span
            className="ml-auto font-medium"
            style={{
              color:
                verdict === "hit"
                  ? "var(--color-success)"
                  : "var(--color-muted-foreground)",
            }}
          >
            {verdict === "hit" ? `✓ ${t("oracleHit")}` : `✕ ${t("oracleMiss")}`}
          </span>
        </div>
      )}
    </div>
  );
}

export function OraculoSection({ items }: { items: OracleItem[] }) {
  const t = useTranslations("scoreboard");
  if (items.length === 0) return null;
  return (
    <FunSection title={t("oracleTitle")} subtitle={t("oracleSubtitle")}>
      <div
        className={
          items.length > 1 ? "grid gap-3 md:grid-cols-2" : "mx-auto max-w-xl"
        }
      >
        {items.map((item) => (
          <OracleCard key={item.id} item={item} />
        ))}
      </div>
    </FunSection>
  );
}
