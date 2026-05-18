"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJIS = [
  // Soccer / sports / trophies
  "⚽", "🏆", "🥇", "🥈", "🥉", "🎯", "⭐", "🔥", "💪", "🏟️",
  // Faces / vibes
  "😀", "😎", "🤓", "🥶", "😈", "👻", "👽", "🤖", "💩", "🎃",
  // Animals
  "🐐", "🦁", "🐯", "🐺", "🐻", "🦅", "🐉", "🐂", "🦊", "🐼",
  // Symbols
  "❤️", "💯", "⚡", "💥", "☠️", "🚀", "👑", "💎", "🎉", "🍻",
  // Flags
  "🇨🇱", "🇪🇸", "🇰🇷", "🇺🇸", "🇲🇽", "🇨🇦", "🇧🇷", "🇦🇷", "🇫🇷", "🇩🇪",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  ariaLabel: string;
}

export function EmojiPicker({ onSelect, ariaLabel }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

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
      <PopoverContent align="start" sideOffset={6} className="w-auto p-2">
        <div className="grid grid-cols-10 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onSelect(e);
                setOpen(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
