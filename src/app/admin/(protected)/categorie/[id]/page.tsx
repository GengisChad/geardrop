import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryEditorForm } from "@/components/admin/catalog/category-editor-form";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { categoryIdSchema } from "@/lib/admin/categories";
import { loadAdminCategoryEditor } from "@/lib/admin/category-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditAdminCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = categoryIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const data = await loadAdminCategoryEditor(client, parsedId.data);
  if (!data) notFound();
  return <div className={styles.page}><header className={styles.heading}><div><p>Categorie / {data.category.id}</p><h1>{data.category.name}</h1><span>{data.category.publication_status} · {data.products.length} prodotti reali</span></div><Link href="/admin/categorie">Torna alle categorie</Link></header><CategoryEditorForm data={data} readyMedia={data.readyMedia} /></div>;
}

