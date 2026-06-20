"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { FunBadge } from "./fun-badge";

/**
 * Wrapper that brands its contents as "just for fun" (dashed border, muted
 * palette, a "POR DIVERSIÓN" kicker and a FunBadge). Dropping a playful feature
 * inside this guarantees the non-scoring disclaimer can't be forgotten.
 */
export function FunSection({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("fun");
  return (
    <section
      className={cn(
        "border-border bg-muted/30 rounded-lg border border-dashed p-4",
        className
      )}
    >
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
        <FunBadge className="shrink-0" />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
