"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewMode = "grid" | "list";

const STORAGE_KEY = "pm:predictions-view";

// List view is desktop-only: below Tailwind's `sm` breakpoint the cards are
// forced into grid mode and the toggle is hidden (see ViewToggle). Keep this
// query in sync with the `sm:` classes used there.
const DESKTOP_QUERY = "(min-width: 640px)";

/**
 * Purely presentational view-mode state (grid of cards vs compact list),
 * exposed via useSyncExternalStore: SSR/hydration always renders "grid",
 * then the client snapshot (localStorage) takes over after mount — no
 * setState-in-effect, no hydration mismatch. Lives apart from
 * PredictionsForm so the save orchestration is untouched.
 *
 * `memoryMode` keeps the toggle working within the session even when
 * localStorage is unavailable (private mode, blocked) — persistence is
 * best-effort, same policy as RoundControls.
 */
let memoryMode: ViewMode | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Re-evaluate on viewport changes so crossing the sm breakpoint
  // (rotation, window resize) flips between list and forced grid.
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function getSnapshot(): ViewMode {
  if (!window.matchMedia(DESKTOP_QUERY).matches) return "grid";
  if (memoryMode !== null) return memoryMode;
  try {
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function getServerSnapshot(): ViewMode {
  return "grid";
}

function setViewMode(mode: ViewMode) {
  memoryMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — the toggle still works this session.
  }
  for (const cb of listeners) cb();
}

/** Current predictions view mode ("grid" until the client store hydrates). */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ViewToggle({
  labels,
}: {
  labels: { viewCards: string; viewList: string };
}) {
  const mode = useViewMode();

  return (
    <div className="hidden items-center gap-1 sm:flex">
      <Button
        size="sm"
        variant={mode === "grid" ? "default" : "outline"}
        onClick={() => setViewMode("grid")}
        aria-pressed={mode === "grid"}
      >
        <LayoutGrid className="size-4" />
        {labels.viewCards}
      </Button>
      <Button
        size="sm"
        variant={mode === "list" ? "default" : "outline"}
        onClick={() => setViewMode("list")}
        aria-pressed={mode === "list"}
      >
        <List className="size-4" />
        {labels.viewList}
      </Button>
    </div>
  );
}

/** Container for a round's match cards: responsive grid or single-column list. */
export function MatchGrid({ children }: { children: ReactNode }) {
  const mode = useViewMode();
  return (
    <div
      className={
        mode === "list"
          ? "flex flex-col gap-2"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {children}
    </div>
  );
}
