import { getTranslations } from "next-intl/server";
import { FunSection } from "@/components/ui/fun-section";
import type { Outcome } from "@/lib/scoring/oracle";

/**
 * Minimal DTO for one oracle card. Consensus + verdict are computed server-side
 * in scoreboard/page.tsx so (a) no client JS is needed to crunch the numbers,
 * and (b) the full MatchPredictionSummary (incl. per-player name arrays) never
 * crosses the wire to the browser.
 */
export interface OracleItem {
  id: string;
  homeCode: string;
  awayCode: string;
  kickoffLabel: string;
  /** Derived from match status: scheduled / live (in_progress) / finished. */
  state: "scheduled" | "live" | "finished";
  /** Pre-computed server-side from oracleConsensus(). */
  consensus: {
    favorite: Outcome;
    shares: { home: number; draw: number; away: number };
    total: number;
  };
  /** Final score when the match is finished; null while upcoming or live. */
  result: { home: number; away: number } | null;
  /**
   * Knockout-aware verdict, pre-computed via finishedOutcome() + oracleVerdict()
   * on the server. Null when the match hasn't finished yet.
   */
  verdict: "hit" | "miss" | null;
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

async function OracleCard({ item }: { item: OracleItem }) {
  const t = await getTranslations("scoreboard");

  const favoriteLabel: string =
    item.consensus.favorite === "home"
      ? item.homeCode
      : item.consensus.favorite === "away"
        ? item.awayCode
        : t("draw");

  const stateTag =
    item.state === "live"
      ? t("oracleLiveTag")
      : item.state === "finished"
        ? t("oraclePlayedTag")
        : t("oracleUpcomingTag");

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="dark:text-foreground font-semibold text-[#1A2855]">
          {item.homeCode} – {item.awayCode}
        </span>
        <span className="text-muted-foreground text-xs">{stateTag}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {t("oracleFavorite")}
        </span>
        <span className="text-foreground text-sm font-semibold">
          {favoriteLabel} · {pct(item.consensus.shares[item.consensus.favorite])}%
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <ConsensusBar
          label={item.homeCode}
          share={item.consensus.shares.home}
          isFavorite={item.consensus.favorite === "home"}
        />
        <ConsensusBar
          label={t("draw")}
          share={item.consensus.shares.draw}
          isFavorite={item.consensus.favorite === "draw"}
        />
        <ConsensusBar
          label={item.awayCode}
          share={item.consensus.shares.away}
          isFavorite={item.consensus.favorite === "away"}
        />
      </div>

      <p className="text-muted-foreground mt-2 text-[11px]">
        {t("oracleVotes", { count: item.consensus.total })} · {item.kickoffLabel}
      </p>

      {item.result && item.verdict && (
        <div className="mt-2 flex items-center gap-1.5 border-t pt-2 text-sm">
          <span className="text-foreground font-medium">
            {t("oracleResult")}: {item.result.home}–{item.result.away}
          </span>
          <span
            className="ml-auto font-medium"
            style={{
              color:
                item.verdict === "hit"
                  ? "var(--color-success)"
                  : "var(--color-muted-foreground)",
            }}
          >
            {item.verdict === "hit"
              ? `✓ ${t("oracleHit")}`
              : `✕ ${t("oracleMiss")}`}
          </span>
        </div>
      )}
    </div>
  );
}

export async function OraculoSection({ items }: { items: OracleItem[] }) {
  const t = await getTranslations("scoreboard");
  if (items.length === 0) return null;
  return (
    <FunSection
      title={t("oracleTitle")}
      subtitle={t("oracleSubtitle")}
      collapsible
      defaultOpen={false}
    >
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
