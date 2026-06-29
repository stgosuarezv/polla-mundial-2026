"use client";

// ── CalzonCelebration — flying underwear on a new perfect score ───────────────
//
// Replaces canvas-confetti (single-color fills only) with DOM-based SVG pieces
// so each garment has a waistband, fabric body, and leg trim in distinct colors.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { markCalzonesSeen } from "@/lib/actions/calzon";

// ---------------------------------------------------------------------------
// Five underwear types traced from the WikiHow panties reference image.
// Each has: colored waistband rect + curved fabric body + leg-opening trim.
// viewBox is sized to contain all curve overhangs without clipping.
// ---------------------------------------------------------------------------
const TYPES = [
  {
    // Brief — full-width elastic, sides nearly straight, soft U-bottom (no V).
    viewBox: "-8 0 116 92",
    markup: `
<rect x="0" y="0" width="100" height="13" rx="4" fill="#C2185B"/>
<path d="M 0,13 L 100,13 C 106,28 105,48 99,63 C 92,74 78,82 60,86 L 50,88 L 40,86 C 22,82 8,74 1,63 C -5,48 -6,28 0,13 Z" fill="#FF8FAB"/>
<path d="M 1,63 C 8,74 22,82 40,86 L 38,90 C 18,86 3,78 -2,65 Z" fill="#C2185B" fill-opacity="0.42"/>
<path d="M 99,63 C 92,74 78,82 60,86 L 62,90 C 82,86 97,78 102,65 Z" fill="#C2185B" fill-opacity="0.42"/>`,
  },
  {
    // Bikini — hip-width band (starts at 14, not the edges), lavender/purple,
    // decorative bow at center waistband, clear moderate V crotch.
    viewBox: "-4 0 108 90",
    markup: `
<rect x="14" y="0" width="72" height="13" rx="4" fill="#6A1B9A"/>
<path d="M 14,13 L 86,13 C 97,20 101,36 95,52 C 87,64 70,74 55,80 L 50,85 L 45,80 C 30,74 13,64 5,52 C -1,36 3,20 14,13 Z" fill="#CE93D8"/>
<ellipse cx="50" cy="6.5" rx="5" ry="4.5" fill="#9C27B0" fill-opacity="0.55"/>
<ellipse cx="50" cy="6.5" rx="2.5" ry="2" fill="#E1BEE7"/>`,
  },
  {
    // Boy shorts — widest of all, shortest height, hem is nearly horizontal
    // (like actual shorts), no V crotch at all.
    viewBox: "-4 0 108 80",
    markup: `
<rect x="0" y="0" width="100" height="13" rx="3" fill="#B71C1C"/>
<path d="M 0,13 L 100,13 L 99,50 C 93,62 78,70 60,74 L 40,74 C 22,70 7,62 1,50 Z" fill="#EF5350"/>
<path d="M 1,50 C 7,62 22,70 40,74 L 38,78 C 18,74 3,66 -1,52 Z" fill="#B71C1C" fill-opacity="0.42"/>
<path d="M 99,50 C 93,62 78,70 60,74 L 62,78 C 82,74 97,66 101,52 Z" fill="#B71C1C" fill-opacity="0.42"/>`,
  },
  {
    // Thong — medium-width waistband, sides bow outward at the hip then sweep
    // sharply to a very deep pointed V crotch. Teal/dark teal.
    viewBox: "0 0 100 98",
    markup: `
<rect x="14" y="0" width="72" height="13" rx="4" fill="#00695C"/>
<path d="M 18,13 L 82,13 C 95,20 98,36 91,53 C 83,67 66,79 53,91 L 50,96 L 47,91 C 34,79 17,67 9,53 C 2,36 5,20 18,13 Z" fill="#4DD0E1"/>`,
  },
  {
    // Tanga brief — same full-width waistband as brief, but the hips balloon
    // outward (to ±16 beyond the band) and leg openings cut extremely high,
    // making coverage taper dramatically from wide waist to a deep V.
    viewBox: "-18 0 136 88",
    markup: `
<rect x="-2" y="0" width="104" height="13" rx="4" fill="#BF360C"/>
<path d="M -2,13 L 102,13 C 112,23 116,40 108,54 C 98,67 78,76 58,81 L 50,84 L 42,81 C 22,76 2,67 -8,54 C -16,40 -12,23 -2,13 Z" fill="#FFAB91"/>
<path d="M -8,54 C 2,67 22,76 42,81 L 40,84 C 18,79 0,70 -10,56 Z" fill="#BF360C" fill-opacity="0.42"/>
<path d="M 108,54 C 98,67 78,76 58,81 L 60,84 C 82,79 100,70 110,56 Z" fill="#BF360C" fill-opacity="0.42"/>`,
  },
];

// ---------------------------------------------------------------------------

function spawnPiece(container: HTMLElement, index: number) {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)]!;

  // Parse viewBox to preserve the garment's aspect ratio
  const vbParts = type.viewBox.trim().split(/\s+/).map(Number);
  const vbW = vbParts[2] ?? 100;
  const vbH = vbParts[3] ?? 90;

  const width = 54 + Math.random() * 24; // 54–78 px
  const height = (width * vbH) / vbW;

  const startX = 4 + Math.random() * 88; // vw
  const startRot = Math.random() * 360;
  const spin = (Math.random() > 0.5 ? 1 : -1) * (220 + Math.random() * 420);
  const drift = (Math.random() - 0.5) * 16; // vw horizontal drift
  const duration = 3000 + Math.random() * 2000;
  const delay = index * 70;

  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:${startX}vw;top:-90px;pointer-events:none;`;
  el.innerHTML = `<svg viewBox="${type.viewBox}" xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}">${type.markup}</svg>`;
  container.appendChild(el);

  el.animate(
    [
      { transform: `rotate(${startRot}deg)`, opacity: 1 },
      {
        transform: `translateX(${drift}vw) translateY(calc(100vh + 110px)) rotate(${startRot + spin}deg)`,
        opacity: 0.75,
      },
    ],
    { duration, delay, easing: "ease-in", fill: "forwards" }
  );

  setTimeout(() => el.remove(), duration + delay + 100);
}

function launchUnderpants() {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden;";
  document.body.appendChild(container);

  const count = 32;
  for (let i = 0; i < count; i++) spawnPiece(container, i);

  setTimeout(() => container.remove(), count * 70 + 5500);
}

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

    const sessionKey = `calzon-celebrated:${perfectCount}`;
    if (sessionStorage.getItem(sessionKey)) return;
    if (firedRef.current) return;
    firedRef.current = true;
    sessionStorage.setItem(sessionKey, "1");

    markCalzonesSeen(perfectCount);

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!prefersReduced) launchUnderpants();

    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        animation:
          "calzon-pop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
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
