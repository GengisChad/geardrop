import Link from "next/link";
import { BundleEditorForm } from "@/components/admin/catalog/bundle-editor-form";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminBundleCreateContext } from "@/lib/admin/bundle-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAdminBundlePage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const context = await loadAdminBundleCreateContext(client);
  return <div className={styles.page}><header className={styles.heading}><div><p>Bundle / Nuovo</p><h1>Nuovo bundle</h1><span>Salvataggio bundle e righe in unica transazione.</span></div><Link href="/admin/bundle">Torna ai bundle</Link></header><BundleEditorForm data={null} products={context.products} readyMedia={context.readyMedia} role={principal.role} /></div>;
}

