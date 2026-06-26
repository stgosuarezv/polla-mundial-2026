import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Marks a surface as purely-for-fun: it never scores points or affects the
 * cash prize. The unmarked default in the app is "official"; anything playful
 * must wear this badge so nobody confuses it with the money pool.
 *
 * Server component — no client JS needed (no interaction, no state).
 */
export async function FunBadge({ className }: { className?: string }) {
  const t = await getTranslations("fun");
  return (
    <span
      title={t("tooltip")}
      className={cn(
        "border-border bg-muted/60 text-muted-foreground inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium select-none",
        className
      )}
    >
      <span aria-hidden>🎈</span>
      {t("badge")} · {t("noPoints")}
    </span>
  );
}
