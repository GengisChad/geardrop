import Link from "next/link";
import { CategoryEditorForm } from "@/components/admin/catalog/category-editor-form";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminCategoryCreateContext } from "@/lib/admin/category-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAdminCategoryPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const readyMedia = await loadAdminCategoryCreateContext(client);
  return <div className={styles.page}><header className={styles.heading}><div><p>Categorie / Nuova</p><h1>Nuova categoria</h1><span>Bozza reale. Nessuna pubblicazione automatica.</span></div><Link href="/admin/categorie">Torna alle categorie</Link></header><CategoryEditorForm data={null} readyMedia={readyMedia} /></div>;
}

