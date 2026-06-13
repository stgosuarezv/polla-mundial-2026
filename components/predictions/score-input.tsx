"use client";

// ── ScoreInput — number box with external ▲/▼ buttons ────────────────────────
// Extracted here so it can be shared by MatchCard and WhatIfPanel.

export function ScoreInput({
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
