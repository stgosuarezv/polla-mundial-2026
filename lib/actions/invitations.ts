"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_EMAIL } from "@/lib/email/resend";
import { randomUUID } from "crypto";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return { ok: false, error: "Forbidden" };
  return null;
}

// ── Create invitation ─────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().email(),
  locale: z.string().default("es"),
});

export async function createInvitation(
  email: string,
  locale = "es"
): Promise<ActionResult<{ id: string; emailSent: boolean; emailError: string | null }>> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const parsed = InviteSchema.safeParse({ email, locale });
  if (!parsed.success) return { ok: false, error: "Invalid email" };

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const token = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupUrl = `${appUrl}/${locale}/signup?token=${token}`;

  const { data: invitation, error: insertErr } = await admin
    .from("invitations")
    .insert({
      email: parsed.data.email,
      token,
      invited_by: user!.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.message.includes("unique")) {
      return { ok: false, error: "An invitation for this email already exists." };
    }
    return { ok: false, error: insertErr.message };
  }

  // Send invitation email via Resend
  let emailError: string | null = null;
  if (process.env.RESEND_API_KEY) {
    const { error: sendErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: parsed.data.email,
      subject: "Te invitan a Polla Mundial 2026",
      html: `
        <p>¡Hola!</p>
        <p>Has sido invitado a participar en <strong>Polla Mundial 2026</strong>.</p>
        <p><a href="${signupUrl}">Haz clic aquí para registrarte</a></p>
        <p>Este enlace expira en 7 días.</p>
      `,
    });
    if (sendErr) {
      console.error("[createInvitation] Resend send failed", {
        to: parsed.data.email,
        from: FROM_EMAIL,
        name: sendErr.name,
        message: sendErr.message,
      });
      emailError = sendErr.message;
    }
  } else {
    console.warn("[createInvitation] RESEND_API_KEY not set; skipping email send");
    emailError = "missingApiKey";
  }

  return { ok: true, data: { id: invitation!.id, emailSent: emailError === null, emailError } };
}

// ── Revoke invitation ─────────────────────────────────────────────────────────

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .delete()
    .eq("id", id)
    .is("accepted_at", null); // don't delete accepted invitations

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── List invitations ──────────────────────────────────────────────────────────

export async function listInvitations() {
  const guard = await requireAdmin();
  if (guard) return { ok: false as const, error: guard.error, data: [] };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id, email, accepted_at, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false as const, error: error.message, data: [] };
  return { ok: true as const, data: data ?? [] };
}
