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
// Five underwear silhouettes — all use bezier curves so they read as fabric
// rather than polygons. Each has a distinct aspect ratio and silhouette.
//
// shapeFromPath fills the closed path with a solid color, so the OUTLINE
// is what carries the "type" — curved leg openings, waistband height,
// coverage width, and crotch depth all differ between types.
//
// Coordinate space is free-form; canvas-confetti normalises to the bounding
// box automatically, so the proportions (wide/narrow, tall/short) persist.
// ---------------------------------------------------------------------------
const PATHS = [
  // Full brief — tall, wide, full coverage. Sides stay wide before curving
  // gently inward with a low, modest leg opening (almost a U not a V).
  "M 2,0 L 98,0 C 104,18 103,44 97,60 C 90,74 74,84 55,90 L 50,93 L 45,90 C 26,84 10,74 3,60 C -3,44 -4,18 2,0 Z",

  // Bikini — hip-width waistband, sides sweep out then cut back aggressively
  // with a clear high leg opening that creates the classic bikini V-crotch.
  "M 16,0 L 84,0 C 97,6 100,22 94,38 C 86,52 70,64 55,78 L 50,86 L 45,78 C 30,64 14,52 6,38 C 0,22 3,6 16,0 Z",

  // Boy shorts — widest shape, shortest length. Nearly square, curved shorts
  // hem across the full bottom rather than a V crotch.
  "M 0,0 L 100,0 L 98,52 C 92,66 76,76 58,80 L 42,80 C 24,76 8,66 2,52 Z",

  // Thong — wide waistband bar at top, then side strings taper quickly to a
  // very narrow centre triangle. Clearly T-shaped vs all the others.
  "M 0,2 L 100,2 L 100,16 L 57,22 L 53,88 L 50,100 L 47,88 L 43,22 L 0,16 Z",

  // Brazilian / cheeky — similar waistband to bikini but the hip curves are
  // dramatically exaggerated (extend to 112) giving maximum hip emphasis and
  // the very high leg cut that exposes the cheek.
  "M 10,0 L 90,0 C 106,8 112,26 102,42 C 92,56 76,64 57,76 L 50,84 L 43,76 C 24,64 8,56 -2,42 C -12,26 -6,8 10,0 Z",
];

// Three distinct colors — randomly paired with the five shapes by canvas-
// confetti, giving 5×3 = 15 visible combinations per burst.
const COLORS = ["#FF4DA6", "#8B2FC9", "#FF3131"];

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
            ticks: 300,
          });
        }, delay);
      };

      burst(60, 0, 0, 25);     // left side
      burst(120, 1, 150, 25);  // right side
      burst(90, 0.5, 300, 35); // centre top
    }

    setVisible(true);

    // Auto-dismiss after 5 s
    const timer = setTimeout(() => setVisible(false), 5000);
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
