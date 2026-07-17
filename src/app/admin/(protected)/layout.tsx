import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminAccess } from "@/lib/admin/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const client = await createSupabaseServerClient();

  const principal = await requireAdminAccess(client);

  const [profileResult, settingsResult] = await Promise.all([
    client
      .from("staff_profiles")
      .select("display_name")
      .eq("user_id", principal.userId)
      .single(),
    client.from("site_settings").select("accept_orders").eq("singleton", true).maybeSingle(),
  ]);

  if (profileResult.error || settingsResult.error) {
    throw new Error("Impossibile caricare il contesto amministrativo");
  }

  return (
    <AdminShell
      acceptOrders={settingsResult.data?.accept_orders ?? false}
      displayName={profileResult.data.display_name}
      role={principal.role}
    >
      {children}
    </AdminShell>
  );
}
