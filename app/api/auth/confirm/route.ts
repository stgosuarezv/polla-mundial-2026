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
      // Only redirect to same-origin targets (defense in depth: even though the
      // email link is signed by Supabase, refuse open-redirect to external URLs).
      try {
        const nextUrl = new URL(next, origin);
        if (nextUrl.origin === origin) {
          return NextResponse.redirect(nextUrl.toString());
        }
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
