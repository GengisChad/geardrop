import Link from "next/link";
import { ProductEditorForm } from "@/components/admin/products/product-editor-form";
import styles from "@/components/admin/products/products.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminProductCreateContext } from "@/lib/admin/product-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAdminProductPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const categories = await loadAdminProductCreateContext(client);
  return <div className={styles.productsPage}><header className={styles.heading}><div><p>Catalogo / Nuovo</p><h1>Nuovo prodotto</h1><span>Nasce come bozza con stock reale 0.</span></div><Link href="/admin/prodotti">Torna ai prodotti</Link></header><ProductEditorForm categories={categories} data={null} deletionImpact={null} role={principal.role} /></div>;
}
