import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A round section whose match grid can be collapsed by clicking its header.
 * Past (locked) rounds default to collapsed so the page opens on the round
 * you actually need, without scrolling past every finished matchday.
 *
 * Built on the native <details>/<summary> disclosure widget, so the toggle
 * needs no client JS and the browser provides correct semantics for free:
 * <summary> exposes role=button with managed aria-expanded, keyboard
 * (Enter/Space) support, and focus handling. The match cards inside render
 * server-side and hydrate regardless of open state — collapsed only hides
 * them visually (display:none), so each MatchCard stays registered with the
 * PredictionsForm and "Save all" keeps working across collapsed rounds.
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
  return (
    <details open={defaultOpen} className="group">
      <summary className="mb-3 flex w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
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
        <ChevronDown className="text-muted-foreground ml-auto size-5 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
      </summary>
      {children}
    </details>
  );
}
