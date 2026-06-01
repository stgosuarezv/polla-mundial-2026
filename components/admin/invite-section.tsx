"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { createInvitation, revokeInvitation } from "@/lib/actions/invitations";

interface Invitation {
  id: string;
  email: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

interface Props {
  invitations: Invitation[];
  locale: string;
}

interface InviteResult {
  email: string;
  status: "sent" | "exists" | "sendFailed" | "invalid" | "serverError";
  message?: string;
  id?: string;
}

function parseEmails(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    (re.test(t) ? valid : invalid).push(t);
  }
  return { valid, invalid };
}

export function InviteSection({ invitations: initial, locale }: Props) {
  const t = useTranslations("admin.invitations");
  const [invitations, setInvitations] = useState(initial);
  const [emailsInput, setEmailsInput] = useState("");
  const [results, setResults] = useState<InviteResult[]>([]);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { valid, invalid } = useMemo(() => parseEmails(emailsInput), [emailsInput]);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (valid.length === 0) return;
    setResults([]);

    startTransition(async () => {
      const settled = await Promise.all(
        valid.map(async (email) => {
          const r = await createInvitation(email, locale);
          if (!r.ok) {
            const status = r.error.includes("already exists") ? "exists" : "serverError";
            return { email, status, message: r.error } as InviteResult;
          }
          if (!r.data!.emailSent) {
            return {
              email,
              status: "sendFailed" as const,
              message: r.data!.emailError ?? undefined,
              id: r.data!.id,
            };
          }
          return { email, status: "sent" as const, id: r.data!.id };
        })
      );

      const invalidResults: InviteResult[] = invalid.map((email) => ({
        email,
        status: "invalid",
      }));

      const allResults = [...settled, ...invalidResults];
      setResults(allResults);

      const newlyInvited = settled
        .filter((r) => r.id && (r.status === "sent" || r.status === "sendFailed"))
        .map((r) => ({
          id: r.id!,
          email: r.email,
          accepted_at: null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        }));

      if (newlyInvited.length > 0) {
        setInvitations((prev) => [...newlyInvited, ...prev]);
        setEmailsInput("");
      }
    });
  }

  function handleRevoke(id: string) {
    setRevokeError(null);
    startTransition(async () => {
      const result = await revokeInvitation(id);
      if (result.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      } else {
        setRevokeError(result.error);
      }
    });
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status !== "sent").length;

  const pending = invitations.filter((inv) => !inv.accepted_at);
  const accepted = invitations.filter((inv) => inv.accepted_at);

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">{t("inviteTitle")}</h2>
        <form onSubmit={handleInvite} className="space-y-2">
          <label className="text-sm text-muted-foreground">{t("bulkLabel")}</label>
          <textarea
            rows={4}
            placeholder={t("bulkPlaceholder")}
            value={emailsInput}
            onChange={(e) => {
              setEmailsInput(e.target.value);
              setResults([]);
            }}
            className="w-full max-w-md rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {t("detected", { count: valid.length })}
              {invalid.length > 0 && t("invalidCount", { count: invalid.length })}
            </span>
            <Button type="submit" disabled={isPending || valid.length === 0}>
              {isPending ? t("sending") : t("sendInvites")}
            </Button>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("summary", { sent, failed })}
            </p>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  {results.map((r) => (
                    <tr key={r.email} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className={`px-3 py-1.5 font-medium ${
                        r.status === "sent"
                          ? "text-green-600"
                          : r.status === "invalid" || r.status === "serverError"
                          ? "text-destructive"
                          : "text-amber-600"
                      }`}>
                        {r.status === "sent" && t("resultSent")}
                        {r.status === "exists" && t("resultExists")}
                        {r.status === "sendFailed" && t("resultSendFailed", { error: r.message ?? "" })}
                        {r.status === "invalid" && t("resultInvalid")}
                        {r.status === "serverError" && t("resultServerError", { error: r.message ?? "" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pending list */}
      <div>
        <h2 className="mb-2 font-semibold">{t("pending")}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPending")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {pending.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">{inv.email}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {t("expires")} {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={isPending}
                      >
                        {t("revoke")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {revokeError && (
          <p className="mt-2 text-sm text-destructive">
            {t("revokeFailed", { error: revokeError })}
          </p>
        )}
      </div>

      {/* Accepted list */}
      {accepted.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-muted-foreground">
            {t("accepted")}
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {accepted.map((inv) => (
                  <tr key={inv.id} className="opacity-60">
                    <td className="px-3 py-2">{inv.email}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t("accepted")}{" "}
                      {new Date(inv.accepted_at!).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
