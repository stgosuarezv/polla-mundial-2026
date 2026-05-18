"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import EmojiPickerReact, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  ariaLabel: string;
}

export function EmojiPicker({ onSelect, ariaLabel }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  function handleEmojiClick(emojiData: EmojiClickData) {
    onSelect(emojiData.emoji);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border",
          "border-input bg-background text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground"
        )}
      >
        <Smile size={16} />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto border-0 p-0">
        <EmojiPickerReact
          onEmojiClick={handleEmojiClick}
          theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
          lazyLoadEmojis
        />
      </PopoverContent>
    </Popover>
  );
}
