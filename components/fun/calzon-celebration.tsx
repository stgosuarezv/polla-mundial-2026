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
// Underpants silhouette paths (SVG path d-strings; filled solid by canvas-confetti)
// ---------------------------------------------------------------------------
const SHAPES = [
  // Bikini bottom — waistband + two triangular cups meeting in the middle
  "M 0,3 L 20,3 L 16,14 L 12,9 L 8,9 L 4,14 Z",
  // Boy shorts — wide, nearly rectangular trapezoid
  "M 0,0 L 22,0 L 20,14 L 2,14 Z",
  // Thong — narrow V-triangle
  "M 10,0 L 18,14 L 10,8 L 2,14 Z",
  // Briefs — arch with curved leg band
  "M 0,0 L 20,0 L 20,8 Q 10,18 0,8 Z",
];

const COLORS = [
  "#FF69B4", // hot pink
  "#FF1493", // deep pink
  "#FF4500", // red-orange
  "#9B59B6", // purple
  "#00CED1", // turquoise
  "#FFD700", // gold
  "#FF6347", // tomato
  "#32CD32", // lime green
];

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
      const underpants = SHAPES.map((path) =>
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
            scalar: 2.2,
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
        top: "4.5rem",
        left: "50%",
        transform: "translateX(-50%)",
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
          from { opacity: 0; transform: translateX(-50%) scale(0.6); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .calzon-celebration { animation: none; }
        }
      `}</style>
    </div>
  );
}
