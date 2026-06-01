"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function InviteSection({ invitations: initial, locale }: Props) {
  const t = useTranslations("admin.invitations");
  const [invitations, setInvitations] = useState(initial);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setWarnMsg(null);

    startTransition(async () => {
      const result = await createInvitation(email, locale);
      if (!result.ok) {
        setError(result.error);
      } else {
        const sentEmail = email;
        setEmail("");
        setInvitations((prev) => [
          {
            id: result.data!.id,
            email: sentEmail,
            accepted_at: null,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        if (result.data!.emailSent) {
          setSuccessMsg(t("sentTo", { email: sentEmail }));
        } else if (result.data!.emailError === "missingApiKey") {
          setWarnMsg(t("warnNoApiKey"));
        } else {
          setWarnMsg(t("warnSendFailed", { error: result.data!.emailError ?? "" }));
        }
      }
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeInvitation(id);
      if (result.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      }
    });
  }

  const pending = invitations.filter((inv) => !inv.accepted_at);
  const accepted = invitations.filter((inv) => inv.accepted_at);

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">{t("inviteTitle")}</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="max-w-xs"
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? t("sending") : t("sendInvite")}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {successMsg && <p className="mt-2 text-sm text-green-600">{successMsg}</p>}
        {warnMsg && <p className="mt-2 text-sm text-amber-600">{warnMsg}</p>}
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
