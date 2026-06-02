import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  children: ReactNode;
}

export async function AuthCard({ title, children }: AuthCardProps) {
  const locale = await getLocale();
  const tNav = await getTranslations("nav");

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header
        className="border-b-4 border-[#F4C430] shadow-md"
        style={{ backgroundColor: "#1A2855", color: "#F5F0E6" }}
      >
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-md bg-cream px-2 py-1.5">
              <Image
                src="/fwc26-emblem.png"
                alt="FIFA World Cup 26"
                width={56}
                height={44}
                priority
                className="h-9 w-auto sm:h-11"
              />
            </span>
            <span className="font-bold tracking-tight">Polla 2026</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/rules`}
              className="whitespace-nowrap rounded px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {tNav("rules")}
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{title}</CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
