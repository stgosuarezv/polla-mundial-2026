"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { savePrediction } from "@/lib/actions/predictions";
import { usePredictionsForm } from "@/components/predictions/predictions-form";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  code: string;
  name: string;
  flag_url: string | null;
}

interface ExistingPrediction {
  home_score_pred: number;
  away_score_pred: number;
  penalty_winner_team_id: string | null;
  points_awarded: number | null;
}

// Map next-intl locale codes to BCP 47 tags for Intl APIs
const LOCALE_TAG: Record<string, string> = { en: "en", es: "es-CL", ko: "ko-KR" };

interface MatchCardProps {
  matchId: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  kickoffAt: string;
  locale: string;
  status: string;
  actualHome: number | null;
  actualAway: number | null;
  actualPenaltyWinnerId: string | null;
  isKnockout: boolean;
  isLocked: boolean;
  prediction: ExistingPrediction | null;
  t: {
    noTeam: string;
    save: string;
    saving: string;
    saved: string;
    errorSaving: string;
    penaltyWinner: string;
    pts: string;
    noPrediction: string;
  };
}

// The baseline of what's actually been persisted. isDirty compares inputs against
// this (not the prediction prop), so it flips false immediately after a successful
// save without needing the server to re-flow updated props into the mounted card.
interface SavedBaseline {
  home: string | number;
  away: string | number;
  pen: string;
}

export function MatchCard({
  matchId,
  homeTeam,
  awayTeam,
  kickoffAt,
  locale,
  status,
  actualHome,
  actualAway,
  actualPenaltyWinnerId,
  isKnockout,
  isLocked,
  prediction,
  t,
}: MatchCardProps) {
  const [homeInput, setHomeInput] = useState(
    prediction?.home_score_pred ?? ""
  );
  const [awayInput, setAwayInput] = useState(
    prediction?.away_score_pred ?? ""
  );
  const [penWinner, setPenWinner] = useState(
    prediction?.penalty_winner_team_id ?? ""
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >(prediction !== null ? "saved" : "idle");

  // Local baseline of what's been persisted — seeded from the server prediction prop.
  // Updated on every successful save (single or bulk) so isDirty resets immediately
  // without relying on the server re-streaming updated prediction props.
  const [saved, setSaved] = useState<SavedBaseline>({
    home: prediction?.home_score_pred ?? "",
    away: prediction?.away_score_pred ?? "",
    pen: prediction?.penalty_winner_team_id ?? "",
  });

  const [, startTransition] = useTransition();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const showPenPicker =
    isKnockout &&
    homeInput !== "" &&
    awayInput !== "" &&
    Number(homeInput) === Number(awayInput);

  // isDirty compares inputs against the local saved baseline, not the prop.
  const isDirty =
    String(homeInput) !== String(saved.home) ||
    String(awayInput) !== String(saved.away) ||
    penWinner !== saved.pen;

  const isComplete = homeInput !== "" && awayInput !== "";
  const canSave = saveStatus !== "saving" && (isDirty || saveStatus === "error");

  // ── Bulk-save context integration ──────────────────────────────────────────
  const ctx = usePredictionsForm();

  // Stable ref to latest values so getPayload always reads current state
  const stateRef = useRef({
    homeInput,
    awayInput,
    penWinner,
    showPenPicker,
    isDirty,
    isComplete,
  });
  useEffect(() => {
    stateRef.current = {
      homeInput,
      awayInput,
      penWinner,
      showPenPicker,
      isDirty,
      isComplete,
    };
  });

  // Holds the baseline snapshot sent during a bulk save, so onResult can commit
  // it to local state (and flip isDirty false) when the server confirms success.
  const pendingRef = useRef<SavedBaseline | null>(null);

  useEffect(() => {
    if (!ctx || isLocked) return;
    ctx.register(matchId, {
      getPayload() {
        const s = stateRef.current;
        if (!s.isDirty || !s.isComplete) return null;
        // Stash a snapshot of what we're about to send so onResult can commit it.
        pendingRef.current = {
          home: s.homeInput,
          away: s.awayInput,
          pen: s.showPenPicker ? s.penWinner : "",
        };
        return {
          matchId,
          homeScore: Number(s.homeInput),
          awayScore: Number(s.awayInput),
          penaltyWinnerId: s.showPenPicker ? s.penWinner || null : null,
        };
      },
      onSaving() {
        setSaveStatus("saving");
      },
      onResult(ok: boolean) {
        if (ok && pendingRef.current) {
          // Commit the baseline → isDirty becomes false → setDirty(false) fires via effect
          setSaved(pendingRef.current);
          pendingRef.current = null;
        }
        setSaveStatus(ok ? "saved" : "error");
      },
    });
    return () => ctx.unregister(matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, matchId, isLocked]);

  // Tell the context whenever dirty+complete state changes
  useEffect(() => {
    if (!ctx || isLocked) return;
    ctx.setDirty(matchId, isDirty && isComplete);
  }, [ctx, matchId, isDirty, isComplete, isLocked]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canSave) handleSave();
  }

  function handleSave() {
    if (homeInput === "" || awayInput === "") return;
    setSaveStatus("saving");
    startTransition(async () => {
      const result = await savePrediction(
        matchId,
        Number(homeInput),
        Number(awayInput),
        showPenPicker ? penWinner || null : null
      );
      if (result.ok) {
        // Commit the baseline so isDirty flips false and the bulk pill count drops
        setSaved({
          home: homeInput,
          away: awayInput,
          pen: showPenPicker ? penWinner : "",
        });
      }
      setSaveStatus(result.ok ? "saved" : "error");
    });
  }

  const kickoff = new Date(kickoffAt);
  const tag = LOCALE_TAG[locale] ?? locale;
  const kickoffStr = kickoff.toLocaleDateString(tag, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      {/* Kickoff time */}
      <p className="mb-2 text-center text-xs text-muted-foreground">
        {kickoffStr}
      </p>

      {/* Teams + inputs */}
      <div className="flex items-center gap-2">
        {/* Home team */}
        <div className="flex flex-1 flex-col items-center gap-1">
          {homeTeam?.flag_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={homeTeam.flag_url}
              alt={homeTeam.code}
              className="h-6 w-8 object-contain"
            />
          )}
          <span className="text-center text-xs font-medium leading-tight">
            {homeTeam?.name ?? t.noTeam}
          </span>
        </div>

        {/* Score inputs or result */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isLocked ? (
            <>
              <ScoreDisplay value={prediction?.home_score_pred ?? null} />
              <span className="text-sm font-bold text-muted-foreground">-</span>
              <ScoreDisplay value={prediction?.away_score_pred ?? null} />
            </>
          ) : (
            <>
              <ScoreInput
                value={homeInput}
                onChange={(v) => { setHomeInput(v); setSaveStatus("idle"); }}
                onKeyDown={handleEnter}
              />
              <span className="text-sm font-bold text-muted-foreground">-</span>
              <ScoreInput
                value={awayInput}
                onChange={(v) => { setAwayInput(v); setSaveStatus("idle"); }}
                onKeyDown={handleEnter}
              />
            </>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-1 flex-col items-center gap-1">
          {awayTeam?.flag_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={awayTeam.flag_url}
              alt={awayTeam.code}
              className="h-6 w-8 object-contain"
            />
          )}
          <span className="text-center text-xs font-medium leading-tight">
            {awayTeam?.name ?? t.noTeam}
          </span>
        </div>
      </div>

      {/* Actual result (when finished) */}
      {status === "finished" && actualHome != null && actualAway != null && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {actualHome} – {actualAway}
          {actualPenaltyWinnerId && " (pens)"}
        </p>
      )}

      {/* Penalty winner picker (editable KO draws) */}
      {!isLocked && showPenPicker && homeTeam && awayTeam && (
        <div className="mt-2">
          <p className="mb-1 text-center text-xs text-muted-foreground">
            {t.penaltyWinner}
          </p>
          <div className="flex justify-center gap-2">
            {[homeTeam, awayTeam].map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setPenWinner(team.id)}
                className={cn(
                  "rounded border px-3 py-1 text-xs font-medium transition-colors",
                  penWinner === team.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-background hover:border-primary"
                )}
              >
                {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Points (locked round) */}
      {isLocked && (
        <div className="mt-2 text-center">
          {prediction ? (
            <span
              className={cn(
                "text-sm font-bold",
                (prediction.points_awarded ?? 0) > 0
                  ? "text-green-600"
                  : "text-muted-foreground"
              )}
            >
              {prediction.points_awarded ?? "—"} {t.pts}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t.noPrediction}
            </span>
          )}
        </div>
      )}

      {/* Save button (editable rounds) */}
      {!isLocked && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving" || (!isDirty && saveStatus !== "error")}
            className={cn(
              "rounded border px-4 py-1 text-xs font-medium transition-colors",
              saveStatus === "saved"
                ? "border-transparent bg-green-600 text-white dark:bg-green-700 dark:text-white"
                : saveStatus === "error"
                  ? "border-transparent bg-red-600 text-white dark:bg-red-700 dark:text-white"
                  : "bg-primary/10 hover:bg-primary/20 disabled:opacity-40 dark:border-primary dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary/30 dark:disabled:opacity-60"
            )}
            style={
              saveStatus !== "saved" && saveStatus !== "error"
                ? isDark
                  ? { borderColor: "#4A6FBE", color: "#F5F0E6" }
                  : { borderColor: "#1A2855", color: "#1A2855" }
                : undefined
            }
          >
            {saveStatus === "saving"
              ? t.saving
              : saveStatus === "saved"
                ? t.saved
                : saveStatus === "error"
                  ? t.errorSaving
                  : t.save}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ScoreInput — number box with external ▲/▼ buttons ────────────────────────

function ScoreInput({
  value,
  onChange,
  onKeyDown,
}: {
  value: string | number;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const num = value === "" ? null : Number(value);

  function step(delta: number) {
    onChange(String(Math.min(30, Math.max(0, (num ?? 0) + delta))));
  }

  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        min={0}
        max={30}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="no-spinner h-9 rounded border border-border bg-background text-center text-sm font-bold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ width: "3.75rem" }}
      />
      <div className="flex flex-col">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => step(1)}
          disabled={num !== null && num >= 30}
          className="flex h-4 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          aria-label="Increase"
        >
          <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor">
            <path d="M4 0L8 6H0L4 0Z" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => step(-1)}
          disabled={(num ?? 0) <= 0}
          className="flex h-4 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          aria-label="Decrease"
        >
          <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor">
            <path d="M4 6L0 0H8L4 6Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── ScoreDisplay — locked-round score box (matches ScoreInput size) ───────────

function ScoreDisplay({ value }: { value: number | null }) {
  return (
    <div
      className="flex h-9 items-center justify-center rounded border bg-muted text-sm font-bold"
      style={{ width: "3.75rem" }}
    >
      {value ?? "—"}
    </div>
  );
}
