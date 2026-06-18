"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  getDigestMode,
  setDigestMode,
  getDigestLayout,
  setDigestLayout,
  previewDigestForUser,
  exportRoundDigestCsv,
  processLockedRoundsAsAdmin,
  sendDigestToUser,
  type DigestLayout,
} from "@/lib/actions/digest";

interface RoundOption {
  id: string;
  name_key: string;
  stage: string;
  lock_time: string;
  snapshot_sent_at: string | null;
}

interface UserOption {
  id: string;
  display_name: string;
}

interface RecentSnapshot {
  round_id: string;
  name_key: string;
  snapshot_sent_at: string;
  sent_by_display_name: string | null;
}

interface DigestSectionProps {
  initialMode: "manual" | "automated";
  initialLayout: DigestLayout;
  rounds: RoundOption[];
  users: UserOption[];
  recentSnapshots: RecentSnapshot[];
}

export function DigestSection({
  initialMode,
  initialLayout,
  rounds,
  users,
  recentSnapshots,
}: DigestSectionProps) {
  const t = useTranslations("admin.digest");
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "automated">(initialMode);
  const [savingMode, startSavingMode] = useTransition();
  const [modeMsg, setModeMsg] = useState<string | null>(null);

  const [layout, setLayout] = useState<DigestLayout>(initialLayout);
  const [savingLayout, startSavingLayout] = useTransition();
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);

  const [sending, startSending] = useTransition();
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<string[]>([]);

  const [sendingOne, startSendingOne] = useTransition();
  const [sendOneMsg, setSendOneMsg] = useState<string | null>(null);
  const [sendOneErr, setSendOneErr] = useState<string | null>(null);

  const [previewRoundId, setPreviewRoundId] = useState<string>(rounds[0]?.id ?? "");
  const [previewUserId, setPreviewUserId] = useState<string>(users[0]?.id ?? "");
  const [previewLocale, setPreviewLocale] = useState<"" | "es" | "en" | "ko">("");
  const [previewing, startPreview] = useTransition();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const [csvRoundId, setCsvRoundId] = useState<string>(rounds[0]?.id ?? "");
  const [downloadingCsv, startCsv] = useTransition();
  const [csvErr, setCsvErr] = useState<string | null>(null);

  const eligibleCount = rounds.filter(
    (r) => r.lock_time <= new Date().toISOString() && r.snapshot_sent_at === null
  ).length;

  function handleToggleMode(next: "manual" | "automated") {
    setModeMsg(null);
    startSavingMode(async () => {
      const result = await setDigestMode(next);
      if (result.ok) {
        setMode(next);
        const refreshed = await getDigestMode();
        if (refreshed.ok && refreshed.data) setMode(refreshed.data.mode);
        setModeMsg(t("modeSaved"));
      } else {
        setModeMsg(t("modeError", { error: result.error }));
      }
    });
  }

  function handleToggleLayout(next: DigestLayout) {
    setLayoutMsg(null);
    startSavingLayout(async () => {
      const result = await setDigestLayout(next);
      if (result.ok) {
        setLayout(next);
        const refreshed = await getDigestLayout();
        if (refreshed.ok && refreshed.data) setLayout(refreshed.data.layout);
        setLayoutMsg(t("layoutSaved"));
      } else {
        setLayoutMsg(t("layoutError", { error: result.error }));
      }
    });
  }

  function handleSend() {
    setSendMsg(null);
    setSendErr(null);
    setSendErrors([]);
    startSending(async () => {
      const result = await processLockedRoundsAsAdmin();
      if (!result.ok) {
        setSendErr(result.error);
        return;
      }
      const sent = result.data?.rounds.reduce((s, r) => s + r.sent, 0) ?? 0;
      const failed = result.data?.rounds.reduce((s, r) => s + r.failed, 0) ?? 0;
      const roundsSent = result.data?.rounds.length ?? 0;
      setSendErrors(result.data?.rounds.flatMap((r) => r.errors) ?? []);
      if (roundsSent === 0) {
        setSendMsg(t("sendNoEligible"));
      } else {
        setSendMsg(t("sendSummary", { rounds: roundsSent, sent, failed }));
        // Refresh the server-rendered "Recent sends" list and the eligible count.
        router.refresh();
      }
    });
  }

  function handleSendOne() {
    setSendOneMsg(null);
    setSendOneErr(null);
    startSendingOne(async () => {
      const result = await sendDigestToUser(previewRoundId, previewUserId);
      if (result.ok && result.data) {
        setSendOneMsg(t("sendOneSuccess", { name: result.data.displayName }));
      } else if (!result.ok) {
        setSendOneErr(result.error);
      }
    });
  }

  function handlePreview() {
    setPreviewErr(null);
    setPreviewHtml(null);
    setPreviewSubject(null);
    startPreview(async () => {
      const result = await previewDigestForUser(
        previewRoundId,
        previewUserId,
        previewLocale || undefined,
        layout
      );
      if (result.ok && result.data) {
        setPreviewHtml(result.data.html);
        setPreviewSubject(result.data.subject);
      } else if (!result.ok) {
        setPreviewErr(result.error);
      }
    });
  }

  function handleCsv() {
    setCsvErr(null);
    startCsv(async () => {
      const result = await exportRoundDigestCsv(csvRoundId);
      if (!result.ok) {
        setCsvErr(result.error);
        return;
      }
      const { filename, csv } = result.data!;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("modeTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("modeDescription")}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant={mode === "manual" ? "default" : "outline"}
            onClick={() => handleToggleMode("manual")}
            disabled={savingMode}
            size="sm"
          >
            {t("modeManual")}
          </Button>
          <Button
            variant={mode === "automated" ? "default" : "outline"}
            onClick={() => handleToggleMode("automated")}
            disabled={savingMode}
            size="sm"
          >
            {t("modeAutomated")}
          </Button>
          {modeMsg && (
            <span className="ml-2 text-sm text-muted-foreground">{modeMsg}</span>
          )}
        </div>
      </div>

      {/* Layout toggle */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("layoutTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("layoutDescription")}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant={layout === "per_match" ? "default" : "outline"}
            onClick={() => handleToggleLayout("per_match")}
            disabled={savingLayout}
            size="sm"
          >
            {t("layoutPerMatch")}
          </Button>
          <Button
            variant={layout === "per_player" ? "default" : "outline"}
            onClick={() => handleToggleLayout("per_player")}
            disabled={savingLayout}
            size="sm"
          >
            {t("layoutPerPlayer")}
          </Button>
          {layoutMsg && (
            <span className="ml-2 text-sm text-muted-foreground">{layoutMsg}</span>
          )}
        </div>
      </div>

      {/* Manual send */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("sendTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("sendDescription", { count: eligibleCount })}
        </p>
        <Button
          className="mt-3"
          onClick={handleSend}
          disabled={sending || eligibleCount === 0}
        >
          {sending ? t("sending") : t("sendButton")}
        </Button>
        {sendMsg && <p className="mt-2 text-sm text-green-600">{sendMsg}</p>}
        {sendErr && <p className="mt-2 text-sm text-destructive">{sendErr}</p>}
        {sendErrors.length > 0 && (
          <div className="mt-2 text-sm text-destructive">
            <p className="font-medium">{t("sendFailuresTitle")}</p>
            <ul className="mt-1 list-inside list-disc">
              {sendErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("previewTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("previewDescription")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={previewRoundId}
            onChange={(e) => setPreviewRoundId(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name_key.replace(/^rounds\./, "")}
              </option>
            ))}
          </select>
          <select
            value={previewUserId}
            onChange={(e) => setPreviewUserId(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
          <select
            value={previewLocale}
            onChange={(e) =>
              setPreviewLocale(e.target.value as "" | "es" | "en" | "ko")
            }
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">{t("previewLocaleAuto")}</option>
            <option value="es">ES</option>
            <option value="en">EN</option>
            <option value="ko">KO</option>
          </select>
          <Button
            onClick={handlePreview}
            disabled={previewing || !previewRoundId || !previewUserId}
            size="sm"
          >
            {previewing ? t("previewing") : t("previewButton")}
          </Button>
          <Button
            onClick={handleSendOne}
            disabled={sendingOne || !previewRoundId || !previewUserId}
            size="sm"
            variant="outline"
          >
            {sendingOne ? t("sending") : t("sendOneButton")}
          </Button>
        </div>
        {sendOneMsg && (
          <p className="mt-2 text-sm text-green-600">{sendOneMsg}</p>
        )}
        {sendOneErr && (
          <p className="mt-2 text-sm text-destructive">{sendOneErr}</p>
        )}
        {previewErr && (
          <p className="mt-2 text-sm text-destructive">{previewErr}</p>
        )}
        {previewHtml && previewSubject && (
          <div className="mt-3">
            <p className="text-sm">
              <strong>{t("previewSubject")}:</strong> {previewSubject}
            </p>
            <iframe
              title="digest preview"
              sandbox=""
              srcDoc={previewHtml}
              className="mt-2 h-[600px] w-full rounded border"
            />
          </div>
        )}
      </div>

      {/* CSV download */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("csvTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("csvDescription")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={csvRoundId}
            onChange={(e) => setCsvRoundId(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name_key.replace(/^rounds\./, "")}
              </option>
            ))}
          </select>
          <Button
            onClick={handleCsv}
            disabled={downloadingCsv || !csvRoundId}
            size="sm"
            variant="outline"
          >
            {downloadingCsv ? t("downloading") : t("csvButton")}
          </Button>
        </div>
        {csvErr && <p className="mt-2 text-sm text-destructive">{csvErr}</p>}
      </div>

      {/* Recent sends */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("recentTitle")}</h2>
        {recentSnapshots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("recentEmpty")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-1 text-left font-medium">{t("recentRound")}</th>
                <th className="py-1 text-left font-medium">{t("recentSentAt")}</th>
                <th className="py-1 text-left font-medium">{t("recentSentBy")}</th>
              </tr>
            </thead>
            <tbody>
              {recentSnapshots.map((s) => (
                <tr key={s.round_id} className="border-b last:border-0">
                  <td className="py-1.5">{s.name_key.replace(/^rounds\./, "")}</td>
                  <td className="py-1.5 text-muted-foreground">
                    {new Date(s.snapshot_sent_at).toLocaleString()}
                  </td>
                  <td className="py-1.5 text-muted-foreground">
                    {s.sent_by_display_name ?? t("recentAutomated")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
