import { FooterEditor } from "@/components/admin/content/footer-editor";
import styles from "@/components/admin/content/content.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { getFooter } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminFooterPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const footer = await getFooter(client, { includeDrafts: true });
  return <div className={styles.page}><header className={styles.heading}><div><p>CMS / Chrome</p><h1>Footer</h1><span>{footer.columns.length} colonne · {footer.socialLinks.length} link social reali</span></div></header><FooterEditor footer={footer} /></div>;
}
