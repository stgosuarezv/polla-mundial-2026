"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUserDisplayName } from "@/lib/actions/admin";

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

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {users.map((u) => (
            <UserRow key={u.id} user={u} t={t} onSaved={(name) => handleSaved(u.id, name)} />
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
}: {
  user: User;
  t: ReturnType<typeof useTranslations<"admin.users">>;
  onSaved: (name: string) => void;
}) {
  const [value, setValue] = useState(user.display_name);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  const dirty =
    value.trim() !== user.display_name && value.trim().length > 0;

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

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 w-full">
        <Input
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
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {user.is_admin && (
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {t("admin")}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
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
    </tr>
  );
}
