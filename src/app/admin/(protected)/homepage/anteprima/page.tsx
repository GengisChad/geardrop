import Link from "next/link";
import { HomepageSectionRenderer } from "@/components/content/homepage-section-renderer";
import styles from "@/components/admin/homepage/homepage.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listHomepageSections } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminHomepagePreviewPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const sections = await listHomepageSections(client, { includeDrafts: true });

  return <div className={styles.page}>
    <header className={styles.pageHeading}>
      <div><p>CMS / Preview autenticata</p><h1>Anteprima homepage</h1><span>Include bozze e sezioni non attive. Non è la vetrina pubblica.</span></div>
      <Link href="/admin/homepage">Torna all’editor</Link>
    </header>
    {sections.length === 0
      ? <div className={styles.emptyState}><strong>Nessuna sezione</strong><p>Il database è vuoto. Crea la prima sezione dall’editor.</p></div>
      : <main>{sections.map((section) => <HomepageSectionRenderer key={section.id} preview section={section} />)}</main>}
  </div>;
}
