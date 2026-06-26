import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { FunSection } from "@/components/ui/fun-section";
import type { Outcome } from "@/lib/scoring/oracle";

export interface OracleItem {
  id: string;
  homeCode: string;
  awayCode: string;
  kickoffLabel: string;
  state: "scheduled" | "live" | "finished";
  consensus: {
    favorite: Outcome;
    shares: { home: number; draw: number; away: number };
    total: number;
  };
  result: { home: number; away: number } | null;
  verdict: "hit" | "miss" | null;
}

export interface OracleRound {
  id: string;
  nameKey: string;
  orderIndex: number;
  isCurrent: boolean;
  hits: number;
  finishedCount: number;
  items: OracleItem[];
}

const BAR = "#5E7BBF";
const BAR_FAVORITE = "#3D5BA9";

const pct = (share: number) => Math.round(share * 100);

// ── Spotlight card ───────────────────────────────────────────────────────────

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
      <span className="text-muted-foreground w-14 shrink-0 text-sm">
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
        className={`w-9 shrink-0 text-right text-sm tabular-nums ${
          isFavorite ? "text-foreground font-semibold" : "text-muted-foreground"
        }`}
      >
        {pct(share)}%
      </span>
    </div>
  );
}

async function SpotlightCard({ item }: { item: OracleItem }) {
  const t = await getTranslations("scoreboard");

  const favoriteLabel =
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
        <span className="text-muted-foreground text-sm">{stateTag}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
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

      <p className="text-muted-foreground mt-2 text-xs">
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

// ── Summary table ────────────────────────────────────────────────────────────

async function SummaryTable({ rounds }: { rounds: OracleRound[] }) {
  const t = await getTranslations("scoreboard");
  const tRounds = await getTranslations("rounds");

  const totalHits = rounds.reduce((s, r) => s + r.hits, 0);
  const totalFinished = rounds.reduce((s, r) => s + r.finishedCount, 0);

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
        {t("oracleSummaryTitle")}
      </p>
      <div className="space-y-1.5">
        {rounds.map((round) => {
          const roundKey = round.nameKey.replace(
            "rounds.",
            ""
          ) as Parameters<typeof tRounds>[0];
          const hitPct =
            round.finishedCount > 0
              ? Math.round((round.hits / round.finishedCount) * 100)
              : null;
          return (
            <div key={round.id} className="flex items-center gap-2 text-sm">
              <span className="text-foreground min-w-0 flex-1 truncate font-medium">
                {tRounds(roundKey)}
              </span>
              {round.isCurrent && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium"
                  style={{ background: "var(--color-muted)", color: BAR_FAVORITE }}
                >
                  {t("oracleRoundCurrent")}
                </span>
              )}
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {round.finishedCount > 0 ? (
                  <>
                    {round.hits}/{round.finishedCount}
                    <span className="ml-1.5 font-semibold" style={{ color: BAR_FAVORITE }}>
                      {hitPct}%
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
        {totalFinished > 0 && (
          <div className="border-border mt-1 flex items-center gap-2 border-t pt-1.5 text-sm font-semibold">
            <span className="text-foreground min-w-0 flex-1">{t("oracleTotalRow")}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {totalHits}/{totalFinished}
              <span className="ml-1.5" style={{ color: BAR_FAVORITE }}>
                {Math.round((totalHits / totalFinished) * 100)}%
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

async function HistoryRow({ item }: { item: OracleItem }) {
  const t = await getTranslations("scoreboard");

  const favoriteLabel =
    item.consensus.favorite === "home"
      ? item.homeCode
      : item.consensus.favorite === "away"
        ? item.awayCode
        : t("draw");

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-1 text-sm">
      <span className="text-foreground font-medium">
        {item.homeCode} – {item.awayCode}
      </span>

      {item.state === "finished" && item.result ? (
        <>
          <span className="text-muted-foreground tabular-nums">
            {item.result.home}–{item.result.away}
          </span>
          <span
            className="font-semibold"
            style={{
              color:
                item.verdict === "hit"
                  ? "var(--color-success)"
                  : "var(--color-muted-foreground)",
            }}
          >
            {item.verdict === "hit" ? "✓" : "✕"} {favoriteLabel}
          </span>
        </>
      ) : (
        <>
          <span
            className="text-muted-foreground text-xs"
            style={item.state === "live" ? { color: BAR_FAVORITE } : undefined}
          >
            {item.state === "live" ? t("oracleLiveTag") : "—"}
          </span>
          <span className="text-muted-foreground">
            {favoriteLabel} · {pct(item.consensus.shares[item.consensus.favorite])}%
          </span>
        </>
      )}
    </div>
  );
}

async function HistorySection({ rounds }: { rounds: OracleRound[] }) {
  const t = await getTranslations("scoreboard");
  const tRounds = await getTranslations("rounds");

  const totalCount = rounds.reduce((s, r) => s + r.items.length, 0);

  return (
    <details className="group/history mt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          {t("oracleAllMatches", { count: totalCount })}
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0 -rotate-90 transition-transform group-open/history:rotate-0" />
      </summary>

      <div className="mt-3 space-y-4">
        {rounds.map((round) => {
          const roundKey = round.nameKey.replace(
            "rounds.",
            ""
          ) as Parameters<typeof tRounds>[0];
          return (
            <div key={round.id}>
              <div className="mb-1 flex items-center gap-2">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  {tRounds(roundKey)}
                </p>
                {round.isCurrent && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-xs font-medium"
                    style={{ background: "var(--color-muted)", color: BAR_FAVORITE }}
                  >
                    {t("oracleRoundCurrent")}
                  </span>
                )}
              </div>
              <div className="divide-border divide-y">
                {round.items.map((item) => (
                  <HistoryRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function OraculoSection({
  items,
  rounds,
}: {
  items: OracleItem[];
  rounds: OracleRound[];
}) {
  const t = await getTranslations("scoreboard");
  if (rounds.length === 0) return null;

  return (
    <FunSection
      title={t("oracleTitle")}
      subtitle={t("oracleSubtitle")}
      collapsible
      defaultOpen={false}
    >
      <SummaryTable rounds={rounds} />

      {items.length > 0 && (
        <div
          className={`mt-4 ${items.length > 1 ? "grid gap-3 md:grid-cols-2" : "mx-auto max-w-xl"}`}
        >
          {items.map((item) => (
            <SpotlightCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <HistorySection rounds={rounds} />
    </FunSection>
  );
}
