"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

const ADMIN_TABS = [
  "invitations",
  "matches",
  "rounds",
  "users",
  "sync",
  "audit",
] as const;

interface Props {
  label: string;
}

export function AdminDropdown({ label }: Props) {
  const t = useTranslations("admin.tabs");

  return (
    <div className="group relative">
      <Link
        href="/admin"
        className="flex items-center gap-0.5 whitespace-nowrap rounded px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        {label}
        <ChevronDown className="size-3.5 opacity-70 transition-transform group-hover:rotate-180" />
      </Link>

      {/* transparent bridge prevents gap-triggered close */}
      <div className="absolute left-0 top-full z-50 w-44 pt-1 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
        <div className="rounded-md border bg-popover py-1 shadow-md">
          {ADMIN_TABS.map((tab) => (
            <Link
              key={tab}
              href={`/admin?tab=${tab}`}
              className="block px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {t(tab)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
