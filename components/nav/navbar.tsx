import Link from "next/link";
import { LocaleSwitcher } from "./locale-switcher";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";

interface NavBarProps {
  locale: string;
  displayName: string;
  isAdmin: boolean;
  t: {
    predictions: string;
    scoreboard: string;
    podio: string;
    admin: string;
    logout: string;
    menu: string;
  };
}

export function NavBar({ locale, displayName, isAdmin, t }: NavBarProps) {
  return (
    <nav className="bg-[#1f2a5c] text-white shadow-md dark:bg-card">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <Link
          href={`/${locale}/predictions`}
          className="shrink-0 font-bold tracking-tight"
        >
          ⚽ Polla 2026
        </Link>

        {/* Burger menu (mobile only) */}
        <MobileNav locale={locale} isAdmin={isAdmin} t={t} />

        {/* Nav links (desktop only) */}
        <div className="hidden flex-1 items-center gap-1 sm:flex">
          <NavLink href={`/${locale}/predictions`}>{t.predictions}</NavLink>
          <NavLink href={`/${locale}/podio`}>{t.podio}</NavLink>
          <NavLink href={`/${locale}/scoreboard`}>{t.scoreboard}</NavLink>
          {isAdmin && (
            <NavLink href={`/${locale}/admin`}>{t.admin}</NavLink>
          )}
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-white/70 sm:block">
            {displayName}
          </span>
          <ThemeToggle />
          <LocaleSwitcher currentLocale={locale} />
          <LogoutButton locale={locale} label={t.logout} />
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}
