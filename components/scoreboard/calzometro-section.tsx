import { getTranslations } from "next-intl/server";
import { FunSection } from "@/components/ui/fun-section";
import { CalzonDialog } from "./calzon-dialog";
import type { CalzometroResult } from "@/lib/scoring/calzometro";

export async function CalzometroSection({
  result,
}: {
  result: CalzometroResult;
}) {
  const t = await getTranslations("scoreboard");
  const tRounds = await getTranslations("rounds");

  const roundLabel = tRounds(
    result.roundNameKey.replace("rounds.", "") as Parameters<typeof tRounds>[0]
  );

  return (
    <FunSection
      title={t("calzometroTitle")}
      subtitle={t("calzometroSubtitle")}
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-2">
        {result.topPairs.map((pair) => (
          <CalzonDialog
            key={`${pair.userAId}:${pair.userBId}`}
            pair={pair}
            roundLabel={roundLabel}
          />
        ))}
        {result.tiedPairCount > result.topPairs.length && (
          <p className="text-muted-foreground text-xs">
            {t("calzometroTied", {
              count: result.tiedPairCount - result.topPairs.length,
            })}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {t("calzometroFootnote")}
        </p>
      </div>
    </FunSection>
  );
}
