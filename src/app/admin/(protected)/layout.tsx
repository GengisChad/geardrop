import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminAccess } from "@/lib/admin/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const client = await createSupabaseServerClient();

  const principal = await requireAdminAccess(client);

  const profileResult = await client
    .from("staff_profiles")
    .select("display_name")
    .eq("user_id", principal.userId)
    .single();

  if (profileResult.error) {
    throw new Error("Impossibile caricare il contesto amministrativo");
  }

  return (
    <AdminShell
      displayName={profileResult.data.display_name}
      organization={principal.organization}
      organizations={principal.organizations}
      role={principal.role}
    >
      {children}
    </AdminShell>
  );
}
