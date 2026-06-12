"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";

interface DownloadImageButtonProps {
  targetId: string;
  fileName: string;
  label: string;
}

export function DownloadImageButton({
  targetId,
  fileName,
  label,
}: DownloadImageButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        // Capture the full table, not just the visible part of the
        // overflow-x-auto wrapper, as one long image.
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { overflow: "visible" },
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();
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
