import { getTranslations } from "next-intl/server";
import { FunSection } from "@/components/ui/fun-section";
import { buildQuotePool } from "@/lib/fun-quotes";

/**
 * One random group-chat quote per page load ("frases célebres"). Server
 * component: the page is dynamic (auth), so Math.random here is a fresh pick
 * on every request with zero client JS and no hydration mismatch.
 */
export async function FunQuotesSection({
  leaderName,
}: {
  leaderName: string | null;
}) {
  const t = await getTranslations("fun");
  const pool = buildQuotePool(leaderName);
  const q = pool[Math.floor(Math.random() * pool.length)]!;

  return (
    <FunSection title={t("quotes.title")} subtitle={t("quotes.subtitle")}>
      <figure>
        <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm italic">
          «{q.quote}»
        </blockquote>
        <figcaption className="text-muted-foreground mt-1.5 pl-3 text-xs">
          {t("quotes.attribution", { author: q.author })}
        </figcaption>
      </figure>
    </FunSection>
  );
}
