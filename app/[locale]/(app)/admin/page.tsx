import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteSection } from "@/components/admin/invite-section";
import { MatchesSection } from "@/components/admin/matches-section";
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

  // All teams for penalty winner dropdowns
  const { data: teams } = await admin
    .from("teams")
    .select("id, code, name_en")
    .order("name_en", { ascending: true });

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Tabs defaultValue="invitations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invitations">{t("tabs.invitations")}</TabsTrigger>
          <TabsTrigger value="matches">{t("tabs.matches")}</TabsTrigger>
          <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
          <TabsTrigger value="sync">{t("tabs.sync")}</TabsTrigger>
          <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="invitations" className="mt-4">
          <InviteSection invitations={invitations ?? []} locale={locale} />
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <MatchesSection rounds={rounds ?? []} allTeams={teams ?? []} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersSection users={profiles ?? []} />
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <SyncSection />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditSection entries={auditEntries ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
