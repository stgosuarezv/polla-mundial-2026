"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/admin/emoji-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeOwnDisplayName } from "@/lib/actions/profile";
import { updateUserDisplayName } from "@/lib/actions/admin";

export type DisplayNameMode = "admin" | "self-once" | "none";

interface Props {
  userId: string;
  initialName: string;
  mode: DisplayNameMode;
}

/**
 * Renders the user's display_name as an <h1>.
 *
 * mode="admin"      → edit button always available, no warning, calls updateUserDisplayName
 * mode="self-once"  → edit button available, permanent-change warning + confirm dialog,
 *                     calls changeOwnDisplayName; button disappears after a successful save
 * mode="none"       → static text only (viewing another user's profile, or already changed)
 */
export function DisplayNameEditor({ userId, initialName, mode }: Props) {
  const t = useTranslations("profile");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [value, setValue] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [used, setUsed] = useState(false); // self-once: hide button after success
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  const dirty = value.trim() !== name && value.trim().length > 0;
  const canEdit = mode !== "none" && (mode === "admin" || !used);

  function insertAtCursor(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => (v + emoji).slice(0, 50));
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + emoji + value.slice(end)).slice(0, 50);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + [...emoji].length, 50);
      el.setSelectionRange(pos, pos);
    });
  }

  function openEditor() {
    setValue(name);
    setError(null);
    setStatus("idle");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setValue(name);
    setError(null);
    setStatus("idle");
  }

  function handleSaveClick() {
    if (!dirty) return;
    if (mode === "self-once") {
      // Show the confirmation dialog before committing.
      setConfirmOpen(true);
    } else {
      doSave();
    }
  }

  function doSave() {
    setConfirmOpen(false);
    startTransition(async () => {
      setStatus("saving");
      setError(null);

      let res;
      if (mode === "admin") {
        res = await updateUserDisplayName({
          userId,
          displayName: value.trim(),
        });
      } else {
        res = await changeOwnDisplayName({ displayName: value.trim() });
      }

      if (res.ok) {
        const saved = res.data!.displayName;
        setName(saved);
        setValue(saved);
        setStatus("saved");
        setEditing(false);
        if (mode === "self-once") {
          setUsed(true);
        }
        // Refresh server component so the profile page re-evaluates mode.
        router.refresh();
      } else {
        setStatus("error");
        if (res.error === "alreadyChanged") {
          setError(t("alreadyChanged"));
        } else {
          setError(t("saveError"));
        }
      }
    });
  }

  return (
    <>
      {/* Display / edit area */}
      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <div className="flex flex-col gap-1.5 w-full">
            {/* self-once warning */}
            {mode === "self-once" && (
              <p
                className="text-sm font-medium"
                style={{ color: "#b45309" }}
              >
                ⚠️ {t("oneTimeWarning")}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={value}
                maxLength={50}
                autoFocus
                onChange={(e) => {
                  setValue(e.target.value);
                  setStatus("idle");
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dirty) handleSaveClick();
                  if (e.key === "Escape") cancelEdit();
                }}
                aria-label={t("nameLabel")}
                className="max-w-xs"
              />
              <EmojiPicker onSelect={insertAtCursor} ariaLabel={t("insertEmoji")} />
            </div>
            {error && (
              <p className="text-sm" style={{ color: "#dc2626" }}>
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!dirty || status === "saving"}
                onClick={handleSaveClick}
              >
                {status === "saving" ? t("saving") : t("save")}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{name}</h1>
            {canEdit && (
              <button
                type="button"
                onClick={openEditor}
                aria-label={t("editName")}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors"
                style={{ borderColor: "#d9cfbe", color: "#5b6478" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#0a0a0a";
                  (e.currentTarget as HTMLElement).style.borderColor = "#0a0a0a";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#5b6478";
                  (e.currentTarget as HTMLElement).style.borderColor = "#d9cfbe";
                }}
              >
                <Pencil size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Confirmation dialog for self-once mode */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("confirmChangeTitle")}</DialogTitle>
            <DialogDescription>{t("confirmChange")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={doSave} style={{ backgroundColor: "#1A2855" }}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
