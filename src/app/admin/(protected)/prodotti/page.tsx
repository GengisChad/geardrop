import Link from "next/link";
import { ProductListClient } from "@/components/admin/products/product-list-client";
import styles from "@/components/admin/products/products.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminProducts } from "@/lib/admin/product-repository";
import { normalizeAdminProductQuery } from "@/lib/admin/products";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = normalizeAdminProductQuery(params);
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const page = await listAdminProducts(client, query);
  const hrefFor = (nextPage: number) => ({ pathname: "/admin/prodotti", query: { ...params, page: String(nextPage) } });

  return <div className={styles.productsPage}>
    <header className={styles.heading}>
      <div><p>Catalogo / Operazioni</p><h1>Prodotti</h1><span>{page.total} risultati · stock reale separato dagli override commerciali</span></div>
      <Link className={styles.primaryButton} href="/admin/prodotti/nuovo">Nuovo prodotto</Link>
    </header>

    <form className={styles.filters} method="get">
      <label className={styles.searchField}>Cerca<input defaultValue={query.q} name="q" placeholder="Nome, SKU o slug" /></label>
      <label>Pubblicazione<select defaultValue={query.publication} name="publication"><option value="all">Tutte</option><option value="published">Pubblicati</option><option value="draft">Bozze</option><option value="archived">Archiviati</option></select></label>
      <label>Disponibilità<select defaultValue={query.availability} name="availability"><option value="all">Tutte</option><option value="disponibile">Disponibile</option><option value="esaurito">Esaurito</option><option value="pre-ordine">Pre-ordine</option><option value="in-arrivo">In arrivo</option></select></label>
      <label>Categoria<select defaultValue={query.category ?? ""} name="category"><option value="">Tutte</option>{page.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Ordina<select defaultValue={query.sort} name="sort"><option value="updated-desc">Più recenti</option><option value="updated-asc">Meno recenti</option><option value="name-asc">Nome A–Z</option><option value="price-asc">Prezzo crescente</option><option value="price-desc">Prezzo decrescente</option><option value="stock-asc">Stock crescente</option></select></label>
      <label className={styles.checkbox}><input defaultChecked={query.lowStock} name="lowStock" type="checkbox" value="true" />Solo stock basso</label>
      <button type="submit">Filtra</button><Link href="/admin/prodotti">Azzera</Link>
    </form>

    <ProductListClient categories={page.categories} items={page.items} />
    <nav className={styles.pagination} aria-label="Paginazione prodotti">
      {page.page > 1 ? <Link href={hrefFor(page.page - 1)}>Precedente</Link> : <span />}
      <span>Pagina {page.page} di {page.pageCount}</span>
      {page.page < page.pageCount ? <Link href={hrefFor(page.page + 1)}>Successiva</Link> : <span />}
    </nav>
  </div>;
}
