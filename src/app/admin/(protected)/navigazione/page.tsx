import { NavigationEditor } from "@/components/admin/content/navigation-editor";
import styles from "@/components/admin/content/content.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { getNavigation } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminNavigationPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const [desktop, mobile] = await Promise.all([getNavigation(client, "desktop", { includeDrafts: true }), getNavigation(client, "mobile", { includeDrafts: true })]);
  return <div className={styles.page}><header className={styles.heading}><div><p>CMS / Chrome</p><h1>Navigazione</h1><span>Menu desktop e mobile indipendenti · ordine salvato nel database</span></div></header><NavigationEditor desktop={desktop} mobile={mobile} /></div>;
}
