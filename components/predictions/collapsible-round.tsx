"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A round section whose match grid can be collapsed by clicking its header.
 * Past (locked) rounds default to collapsed so the page opens on the round
 * you actually need, without scrolling past every finished matchday.
 */
export function CollapsibleRound({
  title,
  locked,
  badgeLabel,
  defaultOpen,
  children,
}: {
  title: string;
  locked: boolean;
  badgeLabel: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center gap-2 text-left"
      >
        <h2 className="border-highlight dark:text-foreground border-l-4 pl-3 text-lg font-semibold text-[#1A2855]">
          {title}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            locked
              ? "bg-muted text-muted-foreground"
              : "bg-green-100 text-green-700"
          }`}
        >
          {badgeLabel}
        </span>
        <ChevronDown
          className={`text-muted-foreground ml-auto size-5 shrink-0 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      <div className={open ? "" : "hidden"}>{children}</div>
    </section>
  );
}
