import Link from "next/link";
import Image from "next/image";
import { LocaleSwitcher } from "./locale-switcher";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { AdminDropdown } from "./admin-dropdown";

interface NavBarProps {
  locale: string;
  displayName: string;
  isAdmin: boolean;
  profileUserId: string;
  t: {
    predictions: string;
    scoreboard: string;
    podio: string;
    rules: string;
    profile: string;
    admin: string;
    logout: string;
    menu: string;
  };
}

export function NavBar({ locale, displayName, isAdmin, profileUserId, t }: NavBarProps) {
  const isAuthed = profileUserId !== "";
  return (
    <nav className="border-b-4 border-[#F4C430] shadow-md" style={{ backgroundColor: '#1A2855', color: '#F5F0E6' }}>
      <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-3 sm:py-4">
        {/* Logo */}
        <Link
          href={isAuthed ? `/${locale}/predictions` : `/${locale}/rules`}
          className="flex shrink-0 items-center gap-2"
        >
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
          <span className="hidden font-bold tracking-tight sm:inline">
            Polla 2026
          </span>
        </Link>

        {/* Burger menu (mobile only) */}
        <MobileNav locale={locale} isAdmin={isAdmin} profileUserId={profileUserId} t={t} />

        {/* Nav links (desktop only) */}
        <div className="hidden flex-1 items-center gap-1 sm:flex">
          {isAuthed && (
            <>
              <NavLink href={`/${locale}/predictions`}>{t.predictions}</NavLink>
              <NavLink href={`/${locale}/podio`}>{t.podio}</NavLink>
              <NavLink href={`/${locale}/scoreboard`}>{t.scoreboard}</NavLink>
            </>
          )}
          <NavLink href={`/${locale}/rules`}>{t.rules}</NavLink>
          {isAuthed && (
            <NavLink href={`/${locale}/profile/${profileUserId}`}>{t.profile}</NavLink>
          )}
          {isAdmin && (
            <AdminDropdown label={t.admin} />
          )}
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-3">
          {isAuthed && (
            <span className="hidden text-sm text-white/70 sm:block">
              {displayName}
            </span>
          )}
          <ThemeToggle />
          <LocaleSwitcher currentLocale={locale} />
          {isAuthed && <LogoutButton locale={locale} label={t.logout} />}
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
