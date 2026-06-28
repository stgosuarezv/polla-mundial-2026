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
// Five underwear silhouettes traced from the WikiHow panties reference image.
// Every shape uses cubic/quadratic bezier curves so the outlines read as
// fabric. The key differentiators are:
//   Brief    — full-width waistband, sides nearly straight, gentle U-bottom
//   Boyshort — widest of all, shortest height, nearly flat hem (no V)
//   Thong    — medium-width top, sides bow OUT then sweep to a very deep V
//   Tanga    — full-width waist like brief but leg cut is extremely high,
//              so the shape tapers dramatically from wide → near-nothing
//   Bikini   — hip-width only (narrower than brief), medium V crotch
// ---------------------------------------------------------------------------
const PATHS = [
  // Brief — sides come down nearly straight with just a slight outward bow,
  // leg opening is a low gentle arc that barely dips below mid-height.
  // Result: wide rectangle with a soft rounded bottom (U, not V).
  "M 2,0 L 98,0 C 103,14 103,36 98,52 C 92,64 78,74 60,80 L 50,83 L 40,80 C 22,74 8,64 2,52 C -3,36 -3,14 2,0 Z",

  // Boyshort — even wider than brief, much shorter. The leg openings run
  // almost horizontally (like actual shorts), leaving a nearly flat bottom hem.
  "M 0,0 L 100,0 L 99,50 C 93,62 80,70 62,74 L 38,74 C 20,70 7,62 1,50 Z",

  // Thong — medium-width waistband, sides curve outward at the hip then sweep
  // sharply inward to a pronounced deep-V crotch point.
  "M 18,0 L 82,0 C 94,6 97,20 90,35 C 82,50 66,66 53,82 L 50,92 L 47,82 C 34,66 18,50 10,35 C 3,20 6,6 18,0 Z",

  // Tanga brief — full edge-to-edge waistband exactly like brief, but the
  // hip curves balloon outward (to 110) and the leg openings cut extremely
  // high, so coverage narrows dramatically from waist to a shallow V crotch.
  "M 2,0 L 98,0 C 106,10 110,28 102,42 C 92,56 76,66 57,76 L 50,83 L 43,76 C 24,66 8,56 -2,42 C -10,28 -6,10 2,0 Z",

  // Bikini — hip-width only (starts at 15, not the edges like brief/tanga),
  // moderate outward curve, medium leg-cut height, clear but not extreme V.
  "M 15,0 L 85,0 C 96,7 100,22 94,38 C 86,52 70,64 55,78 L 50,86 L 45,78 C 30,64 14,52 6,38 C 0,22 4,7 15,0 Z",
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
      const scalar = 5;
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
