import Link from "next/link";
import { CategoryOrderList } from "@/components/admin/catalog/category-order-list";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminCategories } from "@/lib/admin/category-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminCategoriesPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const page = await listAdminCategories(client);
  return <div className={styles.page}><header className={styles.heading}><div><p>Catalogo / Tassonomia</p><h1>Categorie</h1><span>{page.total} righe reali · ordine numerico PostgreSQL</span></div><Link href="/admin/categorie/nuova">Nuova categoria</Link></header><CategoryOrderList items={page.items} /></div>;
}

