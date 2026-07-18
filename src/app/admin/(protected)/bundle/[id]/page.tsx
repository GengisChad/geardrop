import Link from "next/link";
import { notFound } from "next/navigation";
import { BundleEditorForm } from "@/components/admin/catalog/bundle-editor-form";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminBundleEditor } from "@/lib/admin/bundle-repository";
import { bundleIdSchema } from "@/lib/admin/bundles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditAdminBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = bundleIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const data = await loadAdminBundleEditor(client, parsedId.data);
  if (!data) notFound();
  return <div className={styles.page}><header className={styles.heading}><div><p>Bundle / {data.bundle.id}</p><h1>{data.bundle.title_line_one}</h1><span>{data.bundle.active ? "attivo" : "bozza"} · {data.items.length} prodotti reali</span></div><Link href="/admin/bundle">Torna ai bundle</Link></header><BundleEditorForm data={data} products={data.products} readyMedia={data.readyMedia} role={principal.role} /></div>;
}

