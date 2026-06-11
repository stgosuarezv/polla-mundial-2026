"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { resend, FROM_EMAIL } from "@/lib/email/resend";
import {
  renderRoundDigest,
  type DigestLocale,
  type DigestMatch,
  type DigestMatchPrediction,
  type DigestPodioPrediction,
  type DigestRound,
  type DigestTeam,
} from "@/lib/email/round-digest";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: false; error: string } | { ok: true; userId: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

function normalizeLocale(input: string | null | undefined): DigestLocale {
  if (input === "en") return "en";
  if (input === "ko") return "ko";
  return "es";
}

// ── Digest mode (toggle) ─────────────────────────────────────────────────────

export async function getDigestMode(): Promise<
  ActionResult<{ mode: "manual" | "automated" }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("digest_mode")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { mode: data.digest_mode } };
}

export async function setDigestMode(
  mode: "manual" | "automated"
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (mode !== "manual" && mode !== "automated") {
    return { ok: false, error: "Invalid mode" };
  }
  const admin = createAdminClient();

  const { data: prev } = await admin
    .from("app_settings")
    .select("digest_mode")
    .eq("id", 1)
    .single();

  const { error: updErr } = await admin
    .from("app_settings")
    .update({
      digest_mode: mode,
      updated_by: guard.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (updErr) return { ok: false, error: updErr.message };

  await admin.from("app_settings_audit").insert({
    changed_by: guard.userId,
    old_value: { digest_mode: prev?.digest_mode ?? null },
    new_value: { digest_mode: mode },
  });

  return { ok: true };
}

// ── Data fetch (shared by preview, send, CSV) ────────────────────────────────

interface DigestData {
  round: DigestRound;
  matches: DigestMatch[];
  matchPredictions: DigestMatchPrediction[];
  podioPredictions: DigestPodioPrediction[];
  profilesById: Map<string, string>;
  profileLocaleById: Map<string, DigestLocale>;
  teamsById: Map<string, DigestTeam>;
}

async function fetchDigestData(roundId: string): Promise<DigestData | { error: string }> {
  const admin = createAdminClient();

  const { data: roundRow, error: roundErr } = await admin
    .from("rounds")
    .select("id, name_key, stage, lock_time")
    .eq("id", roundId)
    .single();
  if (roundErr || !roundRow) return { error: roundErr?.message ?? "Round not found" };

  const round: DigestRound = {
    name_key: roundRow.name_key,
    stage: roundRow.stage,
    lock_time: roundRow.lock_time,
  };

  // Profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, preferred_locale");
  const profilesById = new Map<string, string>();
  const profileLocaleById = new Map<string, DigestLocale>();
  for (const p of profiles ?? []) {
    profilesById.set(p.id, p.display_name);
    profileLocaleById.set(p.id, normalizeLocale(p.preferred_locale));
  }

  // Teams
  const { data: teams } = await admin
    .from("teams")
    .select("id, code, name_en, name_es, name_ko");
  const teamsById = new Map<string, DigestTeam>();
  for (const t of teams ?? []) teamsById.set(t.id, t);

  let matches: DigestMatch[] = [];
  let matchPredictions: DigestMatchPrediction[] = [];
  let podioPredictions: DigestPodioPrediction[] = [];

  if (round.stage === "podio") {
    const { data: podio } = await admin
      .from("podio_predictions")
      .select("user_id, champion_team_id, runner_up_team_id, third_place_team_id");
    podioPredictions = (podio ?? []) as DigestPodioPrediction[];
  } else {
    const { data: matchRows } = await admin
      .from("matches")
      .select(
        `id, kickoff_at,
         home_team:home_team_id ( id, code, name_en, name_es, name_ko ),
         away_team:away_team_id ( id, code, name_en, name_es, name_ko )`
      )
      .eq("round_id", roundId);
    matches = (matchRows ?? []).map((m) => ({
      id: m.id,
      kickoff_at: m.kickoff_at,
      home_team: Array.isArray(m.home_team) ? (m.home_team[0] ?? null) : m.home_team,
      away_team: Array.isArray(m.away_team) ? (m.away_team[0] ?? null) : m.away_team,
    })) as DigestMatch[];

    if (matches.length > 0) {
      const matchIds = matches.map((m) => m.id);
      const { data: preds, error: predsErr } =
        await fetchAllRows<DigestMatchPrediction>((from, to) =>
          admin
            .from("predictions")
            .select(
              "user_id, match_id, home_score_pred, away_score_pred, penalty_winner_team_id"
            )
            .in("match_id", matchIds)
            .order("id")
            .range(from, to)
        );
      if (predsErr) return { error: predsErr };
      matchPredictions = preds;
    }
  }

  return {
    round,
    matches,
    matchPredictions,
    podioPredictions,
    profilesById,
    profileLocaleById,
    teamsById,
  };
}

// ── Preview (admin UI) ────────────────────────────────────────────────────────

export async function previewDigestForUser(
  roundId: string,
  userId: string,
  localeOverride?: DigestLocale
): Promise<ActionResult<{ subject: string; html: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const data = await fetchDigestData(roundId);
  if ("error" in data) return { ok: false, error: data.error };

  const displayName = data.profilesById.get(userId);
  if (!displayName) return { ok: false, error: "User not found" };
  const locale = localeOverride ?? data.profileLocaleById.get(userId) ?? "es";

  const { subject, html } = renderRoundDigest({
    round: data.round,
    recipient: { id: userId, displayName, locale },
    matches: data.matches,
    matchPredictions: data.matchPredictions,
    podioPredictions: data.podioPredictions,
    profilesById: data.profilesById,
    teamsById: data.teamsById,
  });

  return { ok: true, data: { subject, html } };
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportRoundDigestCsv(
  roundId: string,
  locale: DigestLocale = "es"
): Promise<ActionResult<{ filename: string; csv: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const fetched = await fetchDigestData(roundId);
  if ("error" in fetched) return { ok: false, error: fetched.error };
  const data: DigestData = fetched;

  const nameSlug = data.round.name_key.replace(/^rounds\./, "");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `polla-${nameSlug}-${today}.csv`;

  function team(t: DigestTeam | null | undefined): string {
    if (!t) return "";
    return locale === "ko" ? t.name_ko : locale === "en" ? t.name_en : t.name_es;
  }
  function teamById(id: string | null): string {
    if (!id) return "";
    return team(data.teamsById.get(id));
  }

  let csv = "";
  if (data.round.stage === "podio") {
    csv = "player,champion,runner_up,third_place\n";
    const sorted = [...data.podioPredictions].sort((a, b) =>
      (data.profilesById.get(a.user_id) ?? "").localeCompare(
        data.profilesById.get(b.user_id) ?? ""
      )
    );
    for (const p of sorted) {
      csv += [
        csvEscape(data.profilesById.get(p.user_id) ?? p.user_id),
        csvEscape(teamById(p.champion_team_id)),
        csvEscape(teamById(p.runner_up_team_id)),
        csvEscape(teamById(p.third_place_team_id)),
      ].join(",") + "\n";
    }
  } else {
    csv =
      "kickoff,home_team,away_team,player,home_score_pred,away_score_pred,penalty_winner\n";
    const matchById = new Map(data.matches.map((m) => [m.id, m]));
    const rows = data.matchPredictions
      .map((p) => {
        const m = matchById.get(p.match_id);
        if (!m) return null;
        return {
          kickoff: m.kickoff_at,
          home: team(m.home_team),
          away: team(m.away_team),
          player: data.profilesById.get(p.user_id) ?? p.user_id,
          hs: p.home_score_pred,
          as: p.away_score_pred,
          pen: teamById(p.penalty_winner_team_id),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        const k = a.kickoff.localeCompare(b.kickoff);
        if (k !== 0) return k;
        return a.player.localeCompare(b.player);
      });
    for (const r of rows) {
      csv += [
        csvEscape(r.kickoff),
        csvEscape(r.home),
        csvEscape(r.away),
        csvEscape(r.player),
        csvEscape(r.hs),
        csvEscape(r.as),
        csvEscape(r.pen),
      ].join(",") + "\n";
    }
  }

  return { ok: true, data: { filename, csv } };
}

// ── Send digest for a round ──────────────────────────────────────────────────

async function getRecipientEmails(
  userIds: string[]
): Promise<{ emails: Map<string, string>; error?: string }> {
  // Use admin SDK to fetch auth.users emails by ID
  const admin = createAdminClient();
  const map = new Map<string, string>();
  let listError: string | undefined;
  // listUsers paginates; one page (max 1000) is fine for ~50 users
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      listError = `listUsers failed: ${error.message}`;
      break;
    }
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  // Filter to requested
  const want = new Set(userIds);
  for (const id of [...map.keys()]) if (!want.has(id)) map.delete(id);
  return { emails: map, error: listError };
}

interface SendResult {
  roundId: string;
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
}

async function sendDigestForRound(
  roundId: string,
  triggeredBy: string | null
): Promise<SendResult> {
  const result: SendResult = { roundId, attempted: 0, sent: 0, failed: 0, errors: [] };
  const data = await fetchDigestData(roundId);
  if ("error" in data) {
    result.errors.push(data.error);
    return result;
  }

  if (!process.env.RESEND_API_KEY) {
    result.errors.push("RESEND_API_KEY not set; no emails sent");
    return result;
  }

  const userIds = Array.from(data.profilesById.keys());
  const { emails, error: emailsErr } = await getRecipientEmails(userIds);
  if (emailsErr) result.errors.push(emailsErr);
  const admin = createAdminClient();

  for (const userId of userIds) {
    const to = emails.get(userId);
    const displayName = data.profilesById.get(userId);
    if (!to || !displayName) continue;
    result.attempted++;

    const locale = data.profileLocaleById.get(userId) ?? "es";
    const { subject, html } = renderRoundDigest({
      round: data.round,
      recipient: { id: userId, displayName, locale },
      matches: data.matches,
      matchPredictions: data.matchPredictions,
      podioPredictions: data.podioPredictions,
      profilesById: data.profilesById,
      teamsById: data.teamsById,
    });

    try {
      const { error: sendErr } = await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      });
      if (sendErr) {
        result.failed++;
        result.errors.push(`${displayName}: ${sendErr.message}`);
      } else {
        result.sent++;
      }
    } catch (e) {
      result.failed++;
      result.errors.push(`${displayName}: ${(e as Error).message}`);
    }
  }

  // Only mark the round as digested if at least one email actually went out.
  // Total failure (RESEND_API_KEY missing, Resend outage, etc.) leaves
  // snapshot_sent_at NULL so the next run retries. Partial failures get
  // marked — the admin sees the failure count in the result and can clear
  // snapshot_sent_at manually for a targeted re-send if needed.
  if (result.sent > 0) {
    await admin
      .from("rounds")
      .update({
        snapshot_sent_at: new Date().toISOString(),
        snapshot_sent_by: triggeredBy,
      })
      .eq("id", roundId);
  }

  return result;
}

// ── Process all eligible locked rounds ───────────────────────────────────────

export async function processLockedRoundsForDigest(opts: {
  triggeredBy: string | null;
}): Promise<ActionResult<{ rounds: SendResult[] }>> {
  if (opts.triggeredBy !== null) {
    // Manual triggers require admin auth; cron passes null and is guarded by the
    // bearer token at the route layer.
    const guard = await requireAdmin();
    if (!guard.ok) return guard;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: eligible, error } = await admin
    .from("rounds")
    .select("id")
    .lte("lock_time", nowIso)
    .is("snapshot_sent_at", null)
    .order("order_index", { ascending: true });
  if (error) return { ok: false, error: error.message };
  if (!eligible || eligible.length === 0) {
    return { ok: true, data: { rounds: [] } };
  }

  const results: SendResult[] = [];
  for (const r of eligible) {
    results.push(await sendDigestForRound(r.id, opts.triggeredBy));
  }
  return { ok: true, data: { rounds: results } };
}

// Convenience wrapper for the admin button.
export async function processLockedRoundsAsAdmin(): Promise<
  ActionResult<{ rounds: SendResult[] }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  return processLockedRoundsForDigest({ triggeredBy: guard.userId });
}

// Internal hook for the cron route.
export async function processLockedRoundsAsCron(): Promise<
  ActionResult<{ rounds: SendResult[]; skipped?: string }>
> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("digest_mode")
    .eq("id", 1)
    .single();
  if (settings?.digest_mode !== "automated") {
    return { ok: true, data: { rounds: [], skipped: "manual mode" } };
  }
  return processLockedRoundsForDigest({ triggeredBy: null });
}

// ── Recent sends list (for admin UI) ─────────────────────────────────────────

export async function listRecentSnapshots(): Promise<
  ActionResult<
    {
      round_id: string;
      name_key: string;
      snapshot_sent_at: string;
      snapshot_sent_by: string | null;
      sent_by_display_name: string | null;
    }[]
  >
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rounds")
    .select(
      `id, name_key, snapshot_sent_at, snapshot_sent_by,
       sent_by:snapshot_sent_by ( display_name )`
    )
    .not("snapshot_sent_at", "is", null)
    .order("snapshot_sent_at", { ascending: false })
    .limit(20);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).map((r) => {
    const sentBy = Array.isArray(r.sent_by) ? r.sent_by[0] : r.sent_by;
    return {
      round_id: r.id,
      name_key: r.name_key,
      snapshot_sent_at: r.snapshot_sent_at!,
      snapshot_sent_by: r.snapshot_sent_by,
      sent_by_display_name: sentBy?.display_name ?? null,
    };
  });
  return { ok: true, data: rows };
}
