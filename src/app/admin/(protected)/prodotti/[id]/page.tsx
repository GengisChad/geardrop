import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductEditorForm } from "@/components/admin/products/product-editor-form";
import styles from "@/components/admin/products/products.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminProductEditor, loadProductDeletionImpact } from "@/lib/admin/product-repository";
import { productIdSchema } from "@/lib/admin/products";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditAdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = productIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const data = await loadAdminProductEditor(client, parsedId.data);
  if (!data) notFound();
  const deletionImpact = principal.role === "owner" || principal.role === "admin"
    ? await loadProductDeletionImpact(client, parsedId.data)
    : null;
  return <div className={styles.productsPage}><header className={styles.heading}><div><p>Catalogo / {data.product.sku}</p><h1>{data.product.name}</h1><span>{data.product.publication_status} · {data.product.stock_status} · stock reale {data.product.stock_quantity}</span></div><Link href="/admin/prodotti">Torna ai prodotti</Link></header><ProductEditorForm categories={data.categories} data={data} deletionImpact={deletionImpact} role={principal.role} /></div>;
}
