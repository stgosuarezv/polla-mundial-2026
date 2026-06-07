"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteUserByAdmin, updateUserDisplayName } from "@/lib/actions/admin";
import { EmojiPicker } from "./emoji-picker";

interface User {
  id: string;
  display_name: string;
  is_admin: boolean;
}

interface Props {
  users: User[];
}

export function UsersSection({ users: initial }: Props) {
  const t = useTranslations("admin.users");
  const [users, setUsers] = useState(initial);

  function handleSaved(id: string, name: string) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, display_name: name } : u))
    );
  }

  function handleDeleted(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              t={t}
              onSaved={(name) => handleSaved(u.id, name)}
              onDeleted={() => handleDeleted(u.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  user,
  t,
  onSaved,
  onDeleted,
}: {
  user: User;
  t: ReturnType<typeof useTranslations<"admin.users">>;
  onSaved: (name: string) => void;
  onDeleted: () => void;
}) {
  const [value, setValue] = useState(user.display_name);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const [removing, startRemoving] = useTransition();
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dirty =
    value.trim() !== user.display_name && value.trim().length > 0;

  function insertAtCursor(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => (v + emoji).slice(0, 50));
      setStatus("idle");
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + emoji + value.slice(end)).slice(0, 50);
    setValue(next);
    setStatus("idle");
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + [...emoji].length, 50);
      el.setSelectionRange(pos, pos);
    });
  }

  function handleSave() {
    startTransition(async () => {
      setStatus("saving");
      const res = await updateUserDisplayName({
        userId: user.id,
        displayName: value.trim(),
      });
      if (res.ok) {
        setStatus("saved");
        onSaved(res.data!.displayName);
      } else {
        setStatus("error");
      }
    });
  }

  function handleRemove() {
    setRemoveErr(null);
    if (
      !window.confirm(
        t("removeConfirm", { name: user.display_name })
      )
    ) {
      return;
    }
    startRemoving(async () => {
      const res = await deleteUserByAdmin({ userId: user.id });
      if (res.ok) {
        onDeleted();
      } else if (res.error === "selfDelete") {
        setRemoveErr(t("removeErrorSelf"));
      } else if (res.error === "adminDelete") {
        setRemoveErr(t("removeErrorAdmin"));
      } else {
        setRemoveErr(t("removeError", { error: res.error }));
      }
    });
  }

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 w-full">
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={value}
            maxLength={50}
            onChange={(e) => {
              setValue(e.target.value);
              setStatus("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) handleSave();
            }}
          />
          <EmojiPicker onSelect={insertAtCursor} ariaLabel={t("insertEmoji")} />
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {user.is_admin && (
          <span className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {t("admin")}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button
          size="sm"
          disabled={!dirty || status === "saving"}
          onClick={handleSave}
        >
          {status === "saving"
            ? t("saving")
            : status === "saved"
              ? t("saved")
              : t("save")}
        </Button>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {!user.is_admin && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? t("removing") : t("remove")}
            </Button>
            {removeErr && (
              <span className="text-xs text-destructive">{removeErr}</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
