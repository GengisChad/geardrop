import Link from "next/link";
import { HomepageEditor } from "@/components/admin/homepage/homepage-editor";
import styles from "@/components/admin/homepage/homepage.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listHomepageSections, loadHomepageEditorResources } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminHomepagePage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const [sections, resources] = await Promise.all([
    listHomepageSections(client, { includeDrafts: true }),
    loadHomepageEditorResources(client),
  ]);

  return <div className={styles.page}>
    <header className={styles.pageHeading}>
      <div><p>CMS / Composizione</p><h1>Homepage</h1><span>{sections.length} sezioni reali · bozze incluse</span></div>
      <Link href="/admin/homepage/anteprima">Anteprima protetta</Link>
    </header>
    <HomepageEditor resources={resources} sections={sections} />
  </div>;
}
