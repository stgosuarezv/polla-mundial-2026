"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useTransition,
} from "react";
import { saveManyPredictions } from "@/lib/actions/predictions";

// ── Card registration API ─────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface CardHandle {
  /** Returns payload when the card is dirty+complete, else null. */
  getPayload: () => {
    matchId: string;
    homeScore: number;
    awayScore: number;
    penaltyWinnerId?: string | null;
  } | null;
  setStatus: (s: SaveStatus) => void;
}

interface PredictionsFormContextValue {
  /** Called by each MatchCard on mount; unregister on unmount. */
  register: (matchId: string, handle: CardHandle) => void;
  unregister: (matchId: string) => void;
  /** Cards call this whenever their dirty+complete state changes. */
  setDirty: (matchId: string, dirty: boolean) => void;
}

export const PredictionsFormContext =
  createContext<PredictionsFormContextValue | null>(null);

export function usePredictionsForm() {
  return useContext(PredictionsFormContext);
}

// ── Provider + floating "Save all" bar ───────────────────────────────────────

interface PredictionsFormProps {
  children: React.ReactNode;
  labels: {
    saveAll: string;  // "Guardar todo" / "Save all" / "모두 저장"
    saving: string;   // "Guardando…"
    saved: string;    // "Guardado ✓"
  };
}

export function PredictionsForm({ children, labels }: PredictionsFormProps) {
  // Cards register themselves here (ref → no re-renders on register/unregister)
  const cardsRef = useRef<Map<string, CardHandle>>(new Map());

  // Reactive set of dirty+complete match IDs → drives button count
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const [, startTransition] = useTransition();
  const [bulkStatus, setBulkStatus] = useState<"idle" | "saving" | "saved">("idle");

  const register = useCallback((matchId: string, handle: CardHandle) => {
    cardsRef.current.set(matchId, handle);
  }, []);

  const unregister = useCallback((matchId: string) => {
    cardsRef.current.delete(matchId);
    setDirtyIds((prev) => {
      if (!prev.has(matchId)) return prev;
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
  }, []);

  const setDirty = useCallback((matchId: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      const has = prev.has(matchId);
      if (dirty === has) return prev;
      const next = new Set(prev);
      dirty ? next.add(matchId) : next.delete(matchId);
      return next;
    });
  }, []);

  function handleSaveAll() {
    const payloads: Parameters<typeof saveManyPredictions>[0] = [];
    const participating: string[] = [];

    for (const [matchId, handle] of cardsRef.current) {
      const payload = handle.getPayload();
      if (payload) {
        payloads.push(payload);
        participating.push(matchId);
        handle.setStatus("saving");
      }
    }

    if (payloads.length === 0) return;

    setBulkStatus("saving");
    startTransition(async () => {
      const result = await saveManyPredictions(payloads);
      const finalStatus = result.ok ? "saved" : "error";
      for (const matchId of participating) {
        cardsRef.current.get(matchId)?.setStatus(finalStatus);
      }
      setBulkStatus(result.ok ? "saved" : "idle");
    });
  }

  const count = dirtyIds.size;
  const showBar = count > 0 || bulkStatus === "saving" || bulkStatus === "saved";

  return (
    <PredictionsFormContext.Provider value={{ register, unregister, setDirty }}>
      {children}

      {/* Fixed floating "Save all" pill */}
      {showBar && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 print:hidden">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={bulkStatus === "saving" || count === 0}
            className="rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition-colors disabled:opacity-60"
            style={{
              backgroundColor:
                bulkStatus === "saved" ? "#1EA64F" : "#1A2855",
              color: "#F5F0E6",
            }}
          >
            {bulkStatus === "saving"
              ? labels.saving
              : bulkStatus === "saved"
                ? labels.saved
                : `${labels.saveAll} (${count})`}
          </button>
        </div>
      )}
    </PredictionsFormContext.Provider>
  );
}
