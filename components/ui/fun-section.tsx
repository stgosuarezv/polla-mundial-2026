import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FunBadge } from "./fun-badge";

/**
 * Wrapper that brands its contents as "just for fun" (dashed border, muted
 * palette, a kicker label and a FunBadge). Dropping a playful feature inside
 * this guarantees the non-scoring disclaimer can't be forgotten.
 *
 * When `collapsible` is true, wraps in a native <details>/<summary> disclosure
 * widget — the same zero-JS pattern used by CollapsibleRound. The header
 * (kicker, title, badge, chevron) stays visible while collapsed so users know
 * what they can expand. Pass `defaultOpen={false}` to start collapsed.
 *
 * Server component — no client JS needed (no interaction, no state).
 */
export async function FunSection({
  title,
  subtitle,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const t = await getTranslations("fun");

  const sectionClass = cn(
    "border-border bg-muted/30 rounded-lg border border-dashed p-4",
    className
  );

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
          {t("sectionKicker")}
        </span>
        <h2 className="text-muted-foreground text-base font-bold">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <FunBadge />
        {collapsible && (
          <ChevronDown className="text-muted-foreground size-5 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
        )}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <details open={defaultOpen} className={cn("group", sectionClass)}>
        <summary className="flex cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {header}
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    );
  }

  return (
    <section className={sectionClass}>
      {header}
      <div className="mt-3">{children}</div>
    </section>
  );
}
