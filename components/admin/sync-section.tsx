"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncFromFootballData, rescoreAll } from "@/lib/actions/admin";

export function SyncSection() {
  const t = useTranslations("admin.sync");

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();

  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);
  const [rescoreErr, setRescoreErr] = useState<string | null>(null);
  const [isRescoring, startRescore] = useTransition();

  function handleSync() {
    setSyncMsg(null);
    setSyncErr(null);
    startSync(async () => {
      const result = await syncFromFootballData();
      if (result.ok) {
        const { updated, teamsAssigned } = result.data!;
        setSyncMsg(t("syncSuccess", { updated, teams: teamsAssigned }));
      } else {
        setSyncErr(result.error);
      }
    });
  }

  function handleRescore() {
    setRescoreMsg(null);
    setRescoreErr(null);
    startRescore(async () => {
      const result = await rescoreAll();
      if (result.ok) {
        const { updated } = result.data!;
        setRescoreMsg(t("rescoreSuccess", { updated }));
      } else {
        setRescoreErr(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Sync */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("syncTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("syncDescription")}</p>
        <Button
          className="mt-3"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? t("syncing") : t("syncButton")}
        </Button>
        {syncMsg && (
          <p className="mt-2 text-sm text-green-600">{syncMsg}</p>
        )}
        {syncErr && (
          <p className="mt-2 text-sm text-destructive">{syncErr}</p>
        )}
      </div>

      {/* Rescore */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("rescoreTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rescoreDescription")}</p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={handleRescore}
          disabled={isRescoring}
        >
          {isRescoring ? t("rescoring") : t("rescoreButton")}
        </Button>
        {rescoreMsg && (
          <p className="mt-2 text-sm text-green-600">{rescoreMsg}</p>
        )}
        {rescoreErr && (
          <p className="mt-2 text-sm text-destructive">{rescoreErr}</p>
        )}
      </div>
    </div>
  );
}
