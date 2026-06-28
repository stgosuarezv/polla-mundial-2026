"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatchStatsGrid, type MatchStatsItem } from "./match-stats-card";

export interface MatchStatsGroup {
  /** Unique id for this group (first match's id when simultaneous). */
  id: string;
  /** Display label for the dropdown option. */
  label: string;
  /** One or two items (when matches kick off simultaneously). */
  items: MatchStatsItem[];
}

interface MatchStatsBrowserProps {
  groups: MatchStatsGroup[];
  defaultGroupId: string;
}

/**
 * Browseable stats panel: a centered dropdown lets players navigate between
 * any match whose round has already locked, then shows the MatchStatsGrid for
 * the selected group. When a group has two simultaneous matches the grid shows
 * them side-by-side and the dropdown has a single combined entry.
 */
export function MatchStatsBrowser({
  groups,
  defaultGroupId,
}: MatchStatsBrowserProps) {
  const t = useTranslations("scoreboard");
  const [selectedId, setSelectedId] = useState(defaultGroupId);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // When the dropdown opens, scroll the selected item into view so past matches
  // are above and future matches are below — not buried at the top of the list.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const checked = listRef.current?.querySelector(
        '[data-state="checked"]'
      ) as HTMLElement | null;
      checked?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (groups.length === 0) return null;

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0]!;
  const currentIndex = groups.findIndex((g) => g.id === selectedId);
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < groups.length - 1;

  function handlePrev() {
    if (canPrev) setSelectedId(groups[currentIndex - 1]!.id);
  }
  function handleNext() {
    if (canNext) setSelectedId(groups[currentIndex + 1]!.id);
  }

  return (
    <div className="space-y-2">
      <h2 className="text-center text-sm font-semibold text-muted-foreground">
        {t("matchStatsTitle")}
      </h2>

      {/* Centered row: prev arrow · dropdown · next arrow */}
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handlePrev}
          disabled={!canPrev}
          aria-label="Previous match group"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              {selected.label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className="max-h-72 overflow-y-auto"
          >
            <div ref={listRef}>
              <DropdownMenuRadioGroup
                value={selectedId}
                onValueChange={setSelectedId}
              >
                {groups.map((g) => (
                  <DropdownMenuRadioItem key={g.id} value={g.id}>
                    {g.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleNext}
          disabled={!canNext}
          aria-label="Next match group"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <MatchStatsGrid items={selected.items} />
    </div>
  );
}
