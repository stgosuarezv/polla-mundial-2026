"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateRoundLockTime } from "@/lib/actions/admin";

interface Round {
  id: string;
  name_key: string;
  order_index: number;
  stage: string;
  lock_time: string;
  first_kickoff: string;
}

interface Props {
  rounds: Round[];
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RoundRow({ round }: { round: Round }) {
  const t = useTranslations("admin.rounds");
  const tRounds = useTranslations("rounds");

  const now = new Date();
  const isLocked = new Date(round.lock_time) <= now;
  const roundKey = round.name_key.replace(
    "rounds.",
    ""
  ) as Parameters<typeof tRounds>[0];

  const [value, setValue] = useState(
    round.lock_time ? toLocalDatetimeInput(round.lock_time) : ""
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!value) return;
    setSaveState("saving");
    setErrorMsg("");
    startTransition(async () => {
      const result = await updateRoundLockTime({
        roundId: round.id,
        lockTime: new Date(value).toISOString(),
      });
      if (result.ok) {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } else {
        setSaveState("error");
        setErrorMsg(
          result.error === "afterKickoff"
            ? t("errorAfterKickoff")
            : t("errorGeneric")
        );
      }
    });
  }

  const ceilingStr = round.first_kickoff
    ? toLocalDatetimeInput(round.first_kickoff)
    : "";

  return (
    <tr className="border-b text-xs hover:bg-muted/20">
      <td className="px-3 py-2 font-medium">{tRounds(roundKey)}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {round.lock_time
          ? new Date(round.lock_time).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—"}
      </td>
      <td className="px-3 py-2">
        {isLocked ? (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t("locked")}
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="datetime-local"
              step={60}
              value={value}
              max={ceilingStr}
              onChange={(e) => {
                setValue(e.target.value);
                setSaveState("idle");
                setErrorMsg("");
              }}
              className="rounded border bg-background px-1.5 py-0.5 text-xs"
            />
            {ceilingStr && (
              <span className="text-muted-foreground">
                {t("ceiling", {
                  time: new Date(round.first_kickoff).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                })}
              </span>
            )}
            {saveState === "error" && errorMsg && (
              <span className="text-destructive">{errorMsg}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {!isLocked && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={isPending || !value}
            className="h-6 text-xs"
          >
            {saveState === "saving"
              ? t("saving")
              : saveState === "saved"
              ? t("saved")
              : t("save")}
          </Button>
        )}
      </td>
    </tr>
  );
}

export function RoundsSection({ rounds }: Props) {
  const t = useTranslations("admin.rounds");

  const sorted = [...rounds].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {t("round")}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {t("currentDeadline")}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {t("newDeadline")}
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((round) => (
              <RoundRow key={round.id} round={round} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
