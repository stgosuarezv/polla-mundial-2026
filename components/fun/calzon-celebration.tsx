"use client";

// ── CalzonCelebration — confetti underpants burst on a new perfect score ──────
//
// A "calzón" (Spanish pun: calzar = to fit perfectly, calzón = underpants) is a
// perfect per-match prediction: 10 pts in the group stage or 25 pts in KO.
// Fires once per new calzón (count-based) using DB persistence so it survives
// across devices / sessions.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import { markCalzonesSeen } from "@/lib/actions/calzon";

// ---------------------------------------------------------------------------
// Three underwear silhouettes as SVG paths (filled solid by canvas-confetti,
// so the outline/silhouette is what's visible). Using shapeFromPath (not
// shapeFromText/emoji) so the colors array actually tints each particle.
//
// Coordinate space ~0-100 wide, ~0-100 tall — canvas-confetti scales the
// bounding box to fit the particle size automatically.
// ---------------------------------------------------------------------------
const PATHS = [
  // Bikini bottom — wide waistband, tapers to a V at the crotch
  "M 5,0 L 95,0 L 75,55 L 55,80 L 50,100 L 45,80 L 25,55 Z",
  // Boy shorts — boxy, nearly rectangular, straight leg hem
  "M 2,0 L 98,0 L 92,65 L 8,65 Z",
  // Thong — very narrow triangle
  "M 35,0 L 65,0 L 52,100 L 50,82 L 48,100 Z",
];

// Three distinct colors — one per shape type → 3×3 = 9 visible combinations
const COLORS = ["#FF69B4", "#9B59B6", "#FF2525"];

// ---------------------------------------------------------------------------

interface Props {
  perfectCount: number;
  seenCount: number;
}

export function CalzonCelebration({ perfectCount, seenCount }: Props) {
  const t = useTranslations("fun");
  const [visible, setVisible] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (perfectCount <= seenCount) return;

    // Guard against double-fire within the same browser session
    const sessionKey = `calzon-celebrated:${perfectCount}`;
    if (sessionStorage.getItem(sessionKey)) return;
    if (firedRef.current) return;
    firedRef.current = true;
    sessionStorage.setItem(sessionKey, "1");

    // Persist immediately — before the confetti, to avoid re-celebrating if the
    // user navigates away mid-animation.
    markCalzonesSeen(perfectCount);

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!prefersReduced) {
      const scalar = 4;
      const underpants = PATHS.map((path) =>
        confetti.shapeFromPath({ path })
      );

      const burst = (
        angle: number,
        originX: number,
        delay: number,
        count: number
      ) => {
        setTimeout(() => {
          confetti({
            particleCount: count,
            angle,
            spread: 60,
            origin: { x: originX, y: 0.6 },
            shapes: underpants,
            colors: COLORS,
            scalar,
            ticks: 220,
          });
        }, delay);
      };

      burst(60, 0, 0, 25);     // left side
      burst(120, 1, 150, 25);  // right side
      burst(90, 0.5, 300, 35); // centre top
    }

    setVisible(true);

    // Auto-dismiss after 4 s
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fire once on mount — props are stable server-computed values

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translateX(-50%) translateY(-50%)",
        zIndex: 9999,
        padding: "0.8rem 1.6rem",
        borderRadius: "0.875rem",
        background: "linear-gradient(135deg, #FF69B4 0%, #9B59B6 100%)",
        color: "#ffffff",
        fontWeight: 700,
        fontSize: "1.1rem",
        textAlign: "center",
        boxShadow: "0 6px 28px rgba(0,0,0,0.35)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        userSelect: "none",
        animation: "calzon-pop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
      }}
    >
      {t("calzonTitle")}
      <style>{`
        @keyframes calzon-pop {
          from { opacity: 0; transform: translateX(-50%) translateY(-50%) scale(0.6); }
          to   { opacity: 1; transform: translateX(-50%) translateY(-50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
