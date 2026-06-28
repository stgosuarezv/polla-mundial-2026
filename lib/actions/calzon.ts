"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Updates profiles.calzones_seen for the calling user so the app does not
 * re-celebrate calzones they have already seen.
 *
 * Called by CalzonCelebration after the confetti fires. Safe to call multiple
 * times — idempotent for a given count. No audit needed (not an admin surface).
 */
export async function markCalzonesSeen(count: number): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ calzones_seen: count })
    .eq("id", user.id);
}
