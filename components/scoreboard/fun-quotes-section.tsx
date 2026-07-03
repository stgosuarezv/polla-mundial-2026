import { getTranslations } from "next-intl/server";
import { FunSection } from "@/components/ui/fun-section";
import { buildQuotePool } from "@/lib/fun-quotes";

/**
 * One rotating group-chat quote per page load ("frases célebres"). Server
 * component: the page is dynamic (auth) and passes its request timestamp as
 * `seed`, so each load lands on a different quote — pure render, no client JS.
 */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function FunQuotesSection({
  leaderName,
  seed,
}: {
  leaderName: string | null;
  seed: string;
}) {
  const t = await getTranslations("fun");
  const pool = buildQuotePool(leaderName);
  const q = pool[hashSeed(seed) % pool.length]!;

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
