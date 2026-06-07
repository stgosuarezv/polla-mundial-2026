import { readFileSync } from "fs";
import path from "path";
import { marked } from "marked";
import { getTranslations } from "next-intl/server";
import { PdfButton } from "@/components/rules/pdf-button";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function RulesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("rules");
  const file = locale === "ko" ? "ko.md" : locale === "en" ? "en.md" : "es.md";
  const md = readFileSync(
    path.join(process.cwd(), "content/rules", file),
    "utf-8"
  );
  const html = await marked(md);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <PdfButton label={t("downloadPdf")} />
      </div>
      <div
        className="
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4
          [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2
          [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
          [&_li]:text-sm [&_li]:mb-1
          [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-3 [&_blockquote]:text-sm
          [&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:mb-4
          [&_th]:text-left [&_th]:font-medium [&_th]:px-3 [&_th]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50
          [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-border
          [&_hr]:my-6 [&_hr]:border-border
          [&_strong]:font-semibold
          [&_table]:break-inside-avoid"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
