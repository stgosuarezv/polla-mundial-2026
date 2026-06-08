"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

// ── Save a match prediction ───────────────────────────────────────────────────

const PredictionSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
  penaltyWinnerId: z.string().uuid().nullable().optional(),
});

export async function savePrediction(
  matchId: string,
  homeScore: number,
  awayScore: number,
  penaltyWinnerId?: string | null
): Promise<ActionResult> {
  const parsed = PredictionSchema.safeParse({
    matchId,
    homeScore,
    awayScore,
    penaltyWinnerId: penaltyWinnerId ?? null,
  });

  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "unauthenticated" };

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      match_id: parsed.data.matchId,
      home_score_pred: parsed.data.homeScore,
      away_score_pred: parsed.data.awayScore,
      penalty_winner_team_id: parsed.data.penaltyWinnerId ?? null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" }
  );

  if (error) {
    if (error.message.includes("security")) return { ok: false, error: "locked" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/(app)/predictions", "page");
  return { ok: true };
}

// ── Bulk-save multiple match predictions in one round-trip ───────────────────

type PredictionPayload = z.infer<typeof PredictionSchema>;

export async function saveManyPredictions(
  items: PredictionPayload[]
): Promise<ActionResult> {
  const parsed = z.array(PredictionSchema).safeParse(items);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const rows = parsed.data.map((p) => ({
    user_id: user.id,
    match_id: p.matchId,
    home_score_pred: p.homeScore,
    away_score_pred: p.awayScore,
    penalty_winner_team_id: p.penaltyWinnerId ?? null,
    submitted_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("predictions")
    .upsert(rows, { onConflict: "user_id,match_id" });

  if (error) {
    if (error.message.includes("security")) return { ok: false, error: "locked" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/(app)/predictions", "page");
  return { ok: true };
}

// ── Save podio prediction (editable until deadline) ──────────────────────────

const PodioSchema = z.object({
  championId: z.string().uuid(),
  runnerUpId: z.string().uuid(),
  thirdPlaceId: z.string().uuid(),
}).refine(
  (d) =>
    d.championId !== d.runnerUpId &&
    d.championId !== d.thirdPlaceId &&
    d.runnerUpId !== d.thirdPlaceId,
  { message: "mustBeDistinct" }
);

export async function savePodio(
  championId: string,
  runnerUpId: string,
  thirdPlaceId: string
): Promise<ActionResult> {
  const parsed = PodioSchema.safeParse({ championId, runnerUpId, thirdPlaceId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { error } = await supabase.from("podio_predictions").upsert(
    {
      user_id: user.id,
      champion_team_id: parsed.data.championId,
      runner_up_team_id: parsed.data.runnerUpId,
      third_place_team_id: parsed.data.thirdPlaceId,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (error.message.includes("security")) return { ok: false, error: "locked" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/(app)/podio", "page");
  return { ok: true };
}
