import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav/navbar";
import { CalzonCelebration } from "@/components/fun/calzon-celebration";

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: calzonCount }] = user
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, is_admin, calzones_seen")
          .eq("id", user.id)
          .single(),
        supabase.rpc("my_calzon_count"),
      ])
    : ([{ data: null }, { data: 0 }] as const);

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar
        locale={locale}
        displayName={profile?.display_name ?? ""}
        isAdmin={profile?.is_admin ?? false}
        profileUserId={user?.id ?? ""}
        t={{
          predictions: t("predictions"),
          scoreboard: t("scoreboard"),
          podio: t("podio"),
          rules: t("rules"),
          profile: t("profile"),
          admin: t("admin"),
          logout: t("logout"),
          menu: t("menu"),
        }}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
      {user && (
        <CalzonCelebration
          perfectCount={calzonCount ?? 0}
          seenCount={profile?.calzones_seen ?? 0}
        />
      )}
    </div>
  );
}
