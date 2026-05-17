"use client";

import { useState, useTransition } from "react";
import { savePrediction } from "@/lib/actions/predictions";
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
  const [, startTransition] = useTransition();

  const isDirty =
    String(homeInput) !== String(prediction?.home_score_pred ?? "") ||
    String(awayInput) !== String(prediction?.away_score_pred ?? "") ||
    penWinner !== (prediction?.penalty_winner_team_id ?? "");

  const canSave = saveStatus !== "saving" && (isDirty || saveStatus === "error");

  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canSave) handleSave();
  }

  const showPenPicker =
    isKnockout &&
    homeInput !== "" &&
    awayInput !== "" &&
    Number(homeInput) === Number(awayInput);

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
              "rounded px-4 py-1 text-xs font-medium transition-colors",
              saveStatus === "saved"
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : saveStatus === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 dark:border dark:border-primary dark:bg-primary/20 dark:text-white dark:hover:bg-primary/30 dark:disabled:opacity-60"
            )}
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

function ScoreInput({
  value,
  onChange,
  onKeyDown,
}: {
  value: string | number;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      max={30}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="h-9 w-10 rounded border border-border bg-background text-center text-sm font-bold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function ScoreDisplay({ value }: { value: number | null }) {
  return (
    <div className="flex h-9 w-10 items-center justify-center rounded border bg-muted text-sm font-bold">
      {value ?? "—"}
    </div>
  );
}
