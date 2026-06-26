"use client";

import { useEffect } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

const STORAGE_PREFIX = "pm:round-open:";

function keyFor(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function allRounds(): HTMLDetailsElement[] {
  return Array.from(
    document.querySelectorAll<HTMLDetailsElement>("[data-round-collapsible]")
  );
}

function persist(el: HTMLDetailsElement) {
  const id = el.dataset.roundId;
  if (!id) return;
  try {
    localStorage.setItem(keyFor(id), el.open ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode, blocked) — persistence is
    // best-effort; the rounds still collapse/expand normally this session.
  }
}

/**
 * Client island for the collapsible round sections. It:
 *  - restores each round's open state from localStorage on mount (overriding
 *    the server-rendered default, so a player's manual choice sticks);
 *  - persists every toggle (manual or via the buttons below);
 *  - renders the "Expand all" / "Collapse all" controls.
 *
 * Lives apart from <CollapsibleRound> so that component can stay a pure
 * server component with no client JS for the toggle itself. The `toggle`
 * event does not bubble, so we listen in the capture phase to catch toggles
 * from every <details> on the page through one listener.
 */
export function RoundControls({
  labels,
}: {
  labels: { expandAll: string; collapseAll: string };
}) {
  useEffect(() => {
    // Persist any toggle (capture phase — `toggle` doesn't bubble).
    const onToggle = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLDetailsElement && el.dataset.roundCollapsible !== undefined) {
        persist(el);
      }
    };
    document.addEventListener("toggle", onToggle, true);

    // Restore saved open states (manual choices win over the SSR default).
    for (const el of allRounds()) {
      const id = el.dataset.roundId;
      if (!id) continue;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(keyFor(id));
      } catch {
        saved = null;
      }
      if (saved === "1" && !el.open) el.open = true;
      else if (saved === "0" && el.open) el.open = false;
    }

    return () => document.removeEventListener("toggle", onToggle, true);
  }, []);

  const setAll = (open: boolean) => {
    for (const el of allRounds()) {
      if (el.open !== open) el.open = open; // fires `toggle` → persisted above
    }
  };

  return (
    <div className="flex items-center justify-end gap-4 text-sm">
      <button
        type="button"
        onClick={() => setAll(true)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        <ChevronsUpDown className="size-4" />
        {labels.expandAll}
      </button>
      <button
        type="button"
        onClick={() => setAll(false)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        <ChevronsDownUp className="size-4" />
        {labels.collapseAll}
      </button>
    </div>
  );
}
