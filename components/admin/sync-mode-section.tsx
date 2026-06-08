"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getSyncMode, setSyncMode } from "@/lib/actions/sync-settings";

interface SyncModeSectionProps {
  initialMode: "manual" | "automated";
}

export function SyncModeSection({ initialMode }: SyncModeSectionProps) {
  const t = useTranslations("admin.sync");
  const [mode, setMode] = useState<"manual" | "automated">(initialMode);
  const [savingMode, startSavingMode] = useTransition();
  const [modeMsg, setModeMsg] = useState<string | null>(null);

  function handleToggleMode(next: "manual" | "automated") {
    setModeMsg(null);
    startSavingMode(async () => {
      const result = await setSyncMode(next);
      if (result.ok) {
        setMode(next);
        const refreshed = await getSyncMode();
        if (refreshed.ok) setMode(refreshed.data!.mode);
        setModeMsg(t("modeSaved"));
      } else {
        setModeMsg(t("modeError", { error: result.error }));
      }
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold">{t("syncModeTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("syncModeDescription")}</p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant={mode === "manual" ? "default" : "outline"}
          disabled={savingMode || mode === "manual"}
          onClick={() => handleToggleMode("manual")}
        >
          {t("modeManual")}
        </Button>
        <Button
          size="sm"
          variant={mode === "automated" ? "default" : "outline"}
          disabled={savingMode || mode === "automated"}
          onClick={() => handleToggleMode("automated")}
        >
          {t("modeAutomated")}
        </Button>
      </div>
      {modeMsg && (
        <p className="mt-2 text-sm text-muted-foreground">{modeMsg}</p>
      )}
    </div>
  );
}
