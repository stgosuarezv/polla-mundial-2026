"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileNavProps {
  locale: string;
  isAdmin: boolean;
  t: {
    menu: string;
    predictions: string;
    scoreboard: string;
    podio: string;
    admin: string;
  };
}

export function MobileNav({ locale, isAdmin, t }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t.menu}
        className="rounded p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
      >
        <Menu size={20} />
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetTitle className="px-4 pt-4">⚽ Polla 2026</SheetTitle>
        <nav className="mt-4 flex flex-col">
          <MobileLink href={`/${locale}/predictions`} onClick={close}>
            {t.predictions}
          </MobileLink>
          <MobileLink href={`/${locale}/podio`} onClick={close}>
            {t.podio}
          </MobileLink>
          <MobileLink href={`/${locale}/scoreboard`} onClick={close}>
            {t.scoreboard}
          </MobileLink>
          {isAdmin && (
            <MobileLink href={`/${locale}/admin`} onClick={close}>
              {t.admin}
            </MobileLink>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}
