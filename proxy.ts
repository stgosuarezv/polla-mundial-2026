import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/lib/i18n/routing";

const handleI18n = createIntlMiddleware(routing);

// Any locale-prefixed route that isn't an auth page or a public page requires login
const LOCALE_ROOT = /^\/(en|es|ko)(\/|$)/;
const AUTH_PAGES = /^\/(en|es|ko)\/(login|signup|forgot-password|reset-password)/;
// /reset-password is reached with an active session (the recovery one) — exclude
// it from the "redirect logged-in users away from auth pages" rule below, or
// you can never actually use the form to set a new password.
const RESET_PASSWORD = /^\/(en|es|ko)\/reset-password/;
const PUBLIC_PAGES = /^\/(en|es|ko)\/rules(\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Run next-intl first to get locale-aware redirects and cookie settings
  const response = handleI18n(request);

  // Attach Supabase session to the response (refreshes the JWT if needed)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies to both request (so RSC getUser() sees the
          // new token on this same render) and response (so the browser gets it).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must not be skipped or made conditional
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Derive locale for redirect targets
  const localeMatch = pathname.match(/^\/(en|es|ko)(\/|$)/);
  const locale = localeMatch?.[1] ?? routing.defaultLocale;

  if (
    LOCALE_ROOT.test(pathname) &&
    !AUTH_PAGES.test(pathname) &&
    !PUBLIC_PAGES.test(pathname) &&
    !user
  ) {
    const redirectRes = NextResponse.redirect(
      new URL(`/${locale}/login`, request.url)
    );
    response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
    return redirectRes;
  }

  if (AUTH_PAGES.test(pathname) && user && !RESET_PASSWORD.test(pathname)) {
    const redirectRes = NextResponse.redirect(
      new URL(`/${locale}/predictions`, request.url)
    );
    response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
