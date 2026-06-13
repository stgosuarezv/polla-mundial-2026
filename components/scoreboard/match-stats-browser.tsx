"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
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

  if (groups.length === 0) return null;

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0]!;

  return (
    <div className="space-y-2">
      <h2 className="text-center text-sm font-semibold text-muted-foreground">
        {t("matchStatsTitle")}
      </h2>

      {/* Centered dropdown — always rendered, even with one group, so the title
          always has a visual anchor and future matches slot in automatically. */}
      <div className="flex justify-center">
        <DropdownMenu>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MatchStatsGrid items={selected.items} />
    </div>
  );
}
