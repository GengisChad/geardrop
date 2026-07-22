import { notFound } from "next/navigation";
import { PageEditor } from "@/components/admin/content/page-editor";
import styles from "@/components/admin/content/content.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { getContentPage } from "@/lib/content/repository";
import { isManagedPageSlug, MANAGED_PAGE_LABELS } from "@/lib/content/managed-pages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminPageEditorPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isManagedPageSlug(slug)) notFound();
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const page = await getContentPage(client, slug, { includeDrafts: true });
  return <div className={styles.page}><header className={styles.heading}><div><p>CMS / Pagina</p><h1>{MANAGED_PAGE_LABELS[slug]}</h1><span>{page ? "Contenuto reale caricato" : "Database vuoto per questo slug"}</span></div></header><PageEditor page={page} slug={slug} /></div>;
}
