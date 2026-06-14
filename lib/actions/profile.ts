"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ── Change own display name (one-time) ────────────────────────────────────────

const ChangeOwnDisplayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
});

/**
 * Lets the currently authenticated user rename themselves — once, ever.
 * The one-time rule is enforced at the DB level by a trigger on profiles
 * (handle_display_name_change). This action provides an early-exit for a
 * friendlier error message before the trigger raises.
 */
export async function changeOwnDisplayName(
  input: z.infer<typeof ChangeOwnDisplayNameSchema>
): Promise<ActionResult<{ displayName: string }>> {
  const parsed = ChangeOwnDisplayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { displayName } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  // Pre-check: friendly error before the trigger raises.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name_changed_at")
    .eq("id", user.id)
    .single();

  if (profile?.display_name_changed_at != null) {
    return { ok: false, error: "alreadyChanged" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);

  if (error) {
    // Catch the trigger's check_violation in case of a race between the
    // pre-check above and the actual update.
    if (
      error.code === "23514" ||
      error.message.includes("display_name already changed")
    ) {
      return { ok: false, error: "alreadyChanged" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, data: { displayName } };
}

// ── Update preferred locale ────────────────────────────────────────────────────

const LocaleSchema = z.enum(["en", "es", "ko"]);

export async function updatePreferredLocale(locale: string): Promise<void> {
  const parsed = LocaleSchema.safeParse(locale);
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ preferred_locale: parsed.data })
    .eq("id", user.id);
}
