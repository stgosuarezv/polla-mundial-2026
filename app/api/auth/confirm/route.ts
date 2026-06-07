// =============================================================================
// Email confirmation endpoint for password reset.
//
// Uses Supabase's token-hash recovery pattern instead of the PKCE code flow.
// The PKCE flow stores a code_verifier in a browser cookie when the forgot-
// password form is submitted, then requires the SAME browser to be present when
// the callback runs. That breaks every realistic recovery scenario: requesting
// the reset on a phone and clicking the link on a laptop, opening the email in
// a different browser profile, requesting in incognito and clicking later in
// normal mode, etc.
//
// Token-hash flow needs no cookies between the two requests — the email link
// contains everything needed for verifyOtp to establish the session.
//
// Requires the Supabase "Reset Password" email template to send users HERE
// with token_hash + type=recovery params (see PR description for the template
// change).
// =============================================================================

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/es/predictions";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // Discard the next URL's origin and resolve its path against the current
      // request origin. This prevents open-redirect attacks (we always land on
      // our own host) AND tolerates apex/www variants of the same site — if the
      // template was built with apex but the user lands at www (or vice versa),
      // we still go to the right path on the right host.
      try {
        const nextUrl = new URL(next, origin);
        const safePath = nextUrl.pathname + nextUrl.search + nextUrl.hash;
        return NextResponse.redirect(`${origin}${safePath}`);
      } catch {
        // fall through to safe default
      }
      return NextResponse.redirect(`${origin}/es/predictions`);
    }
    console.error("[auth/confirm] verifyOtp failed", {
      type,
      name: error.name,
      status: error.status,
      message: error.message,
    });
  }

  return NextResponse.redirect(`${origin}/es/login?error=verify`);
}
