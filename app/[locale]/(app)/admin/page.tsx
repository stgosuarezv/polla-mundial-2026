import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteSection } from "@/components/admin/invite-section";
import { MatchesSection } from "@/components/admin/matches-section";
import { RoundsSection } from "@/components/admin/rounds-section";
import { SyncSection } from "@/components/admin/sync-section";
import { AuditSection } from "@/components/admin/audit-section";
import { UsersSection } from "@/components/admin/users-section";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  const admin = createAdminClient();

  // ── Invitations ──────────────────────────────────────────────────────────────
  const { data: invitations } = await admin
    .from("invitations")
    .select("id, email, accepted_at, expires_at, created_at")
    .order("created_at", { ascending: false });

  // ── Matches (with teams + round) ─────────────────────────────────────────────
  const { data: rounds } = await admin
    .from("rounds")
    .select(
      `id, name_key, order_index, stage,
       matches (
         id, status, kickoff_at,
         home_score, away_score, penalty_winner_team_id, advancing_team_id,
         home_team:home_team_id ( id, code, name_en ),
         away_team:away_team_id ( id, code, name_en )
       )`
    )
    .neq("stage", "podio")
    .order("order_index", { ascending: true });

  // ── Users ────────────────────────────────────────────────────────────────────
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, is_admin")
    .order("display_name", { ascending: true });

  // ── Audit log (last 50) ───────────────────────────────────────────────────────
  const { data: auditEntries } = await admin
    .from("match_audit")
    .select(
      `id, changed_at, old_value, new_value,
       match:match_id (
         home_team:home_team_id ( code ),
         away_team:away_team_id ( code )
       ),
       changer:changed_by ( display_name )`
    )
    .order("changed_at", { ascending: false })
    .limit(50);

  const { data: roundAuditEntries } = await admin
    .from("round_audit")
    .select(
      `id, changed_at, old_value, new_value,
       round:round_id ( name_key ),
       changer:changed_by ( display_name )`
    )
    .order("changed_at", { ascending: false })
    .limit(50);

  // ── Rounds for lock-time editor ───────────────────────────────────────────────
  const { data: roundsForLock } = await admin
    .from("rounds")
    .select("id, name_key, order_index, stage, lock_time, matches(kickoff_at)")
    .order("order_index", { ascending: true });

  const roundsIntermediate = (roundsForLock ?? []).map((r) => {
    const kickoffs = ((r.matches as { kickoff_at: string }[] | null) ?? [])
      .map((m) => m.kickoff_at)
      .filter(Boolean)
      .sort();
    return {
      id: r.id,
      name_key: r.name_key,
      order_index: r.order_index,
      stage: r.stage,
      lock_time: r.lock_time,
      first_kickoff: kickoffs[0] ?? "",
    };
  });
  const r32Ceiling =
    roundsIntermediate.find((r) => r.name_key === "rounds.knockout_r32")
      ?.first_kickoff ?? "";
  const roundsWithCeiling = roundsIntermediate.map((r) => ({
    ...r,
    first_kickoff: r.first_kickoff || r32Ceiling,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Tabs defaultValue="invitations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invitations">{t("tabs.invitations")}</TabsTrigger>
          <TabsTrigger value="matches">{t("tabs.matches")}</TabsTrigger>
          <TabsTrigger value="rounds">{t("tabs.rounds")}</TabsTrigger>
          <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
          <TabsTrigger value="sync">{t("tabs.sync")}</TabsTrigger>
          <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="invitations" className="mt-4">
          <InviteSection invitations={invitations ?? []} locale={locale} />
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <MatchesSection rounds={rounds ?? []} />
        </TabsContent>

        <TabsContent value="rounds" className="mt-4">
          <RoundsSection rounds={roundsWithCeiling} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersSection users={profiles ?? []} />
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <SyncSection />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditSection
            matchEntries={auditEntries ?? []}
            roundEntries={roundAuditEntries ?? []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
