"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/app-url";

type ActionResult = { ok: true } | { ok: false; error: string };

// ── Login ─────────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  locale: z.string().default("es"),
});

export async function login(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { ok: false, error: "error.invalidCredentials" };
  }

  const { email, password, locale } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: "error.invalidCredentials" };
  }

  // Redirect to the user's preferred locale if it differs from the form locale
  let redirectLocale = locale;
  if (authData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_locale")
      .eq("id", authData.user.id)
      .single();
    if (profile?.preferred_locale && profile.preferred_locale !== locale) {
      redirectLocale = profile.preferred_locale;
    }
  }

  redirect(`/${redirectLocale}/predictions`);
}

// ── Signup with invite token ──────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50),
  token: z.string().min(1),
  locale: z.string().default("es"),
});

export async function signupWithToken(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    token: formData.get("token"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { ok: false, error: "error.generic" };
  }

  const { email, password, displayName, token, locale } = parsed.data;

  // Re-validate token with service-role client (user not yet authenticated)
  const admin = createAdminClient();
  const { data: invitation, error: invErr } = await admin
    .from("invitations")
    .select("id, email, expires_at, accepted_at")
    .eq("token", token)
    .single();

  if (invErr || !invitation) {
    return { ok: false, error: "invalidToken" };
  }
  if (invitation.accepted_at) {
    return { ok: false, error: "invalidToken" };
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return { ok: false, error: "tokenExpired" };
  }
  if (invitation.email !== email) {
    return { ok: false, error: "invalidToken" };
  }

  // Create the auth user — profile is auto-created by the DB trigger
  const { error: signupErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (signupErr) {
    if (signupErr.message.toLowerCase().includes("already")) {
      return { ok: false, error: "error.emailInUse" };
    }
    return { ok: false, error: "error.generic" };
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // Sign the user in with their new credentials
  const supabase = await createClient();
  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginErr) {
    // Account created but auto-login failed — send to login page
    redirect(`/${locale}/login`);
  }

  redirect(`/${locale}/predictions`);
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(locale: string = "es") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}

// ── Forgot password ───────────────────────────────────────────────────────────

const ForgotSchema = z.object({
  email: z.string().email(),
  locale: z.string().default("es"),
});

export async function forgotPassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = ForgotSchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { ok: false, error: "error.invalidCredentials" };
  }

  const { email, locale } = parsed.data;
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppOrigin()}/api/auth/callback?next=/${locale}/reset-password`,
  });

  // Always return ok to avoid email enumeration
  return { ok: true };
}

// ── Reset password ────────────────────────────────────────────────────────────

const ResetSchema = z.object({
  password: z.string().min(8),
  locale: z.string().default("es"),
});

export async function resetPassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = ResetSchema.safeParse({
    password: formData.get("password"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { ok: false, error: "error.passwordTooShort" };
  }

  const { password, locale } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { ok: false, error: "error.generic" };
  }

  redirect(`/${locale}/predictions`);
}
