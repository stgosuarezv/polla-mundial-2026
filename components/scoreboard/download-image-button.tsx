"use client";

import { useState } from "react";
import { domToBlob } from "modern-screenshot";
import { Button } from "@/components/ui/button";

interface DownloadImageButtonProps {
  targetId: string;
  fileName: string;
  label: string;
}

// iOS Safari silently crops canvases past ~16.7M pixels; cap the capture
// scale so even a 50-row table stays under it.
const MAX_CANVAS_AREA = 16_000_000;

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function DownloadImageButton({
  targetId,
  fileName,
  label,
}: DownloadImageButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    // Capture the inner <table>: its natural size is the full content even
    // when the wrapper scrolls horizontally, so no overflow overrides needed.
    const wrapper = document.getElementById(targetId);
    const el = wrapper?.querySelector("table") ?? wrapper;
    if (!el) return;
    setBusy(true);
    try {
      const scale = Math.min(
        2,
        Math.sqrt(MAX_CANVAS_AREA / (el.scrollWidth * el.scrollHeight))
      );
      const blob = await domToBlob(el as HTMLElement, {
        scale,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      if (!blob) return;

      // iOS has no web path into the photo library except the native share
      // sheet ("Save Image"), so prefer it on mobile when files are shareable.
      const file = new File([blob], fileName, { type: "image/png" });
      if (isMobile() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          // User closed the sheet — done. Anything else: fall through to
          // the plain download below.
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className="print:hidden"
    >
      {label}
    </Button>
  );
}
