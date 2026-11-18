import { redirect } from "next/navigation";
import { GtinCell } from "@/components/admin/barcodes/gtin-cell";
import styles from "@/components/admin/barcodes/barcodes.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { LABEL_LIMIT } from "@/lib/admin/barcodes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * "Codici ed etichette" (owner, 2026-11-18): the barcode of each box, read with the phone or a
 * scanner gun, and the shop's own SKU labels (QR code) for boxes and shelves.
 */
export default async function ProductCodesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";

  let products = client
    .from("products")
    .select("id,name,sku,gtin,stock_quantity,active")
    .eq("organization_id", principal.organization.id)
    .order("active", { ascending: false })
    .order("name", { ascending: true })
    .limit(300);
  if (query) {
    const pattern = `%${query.replace(/[%_,()]/g, " ")}%`;
    products = products.or(`name.ilike.${pattern},sku.ilike.${pattern},gtin.ilike.${pattern}`);
  }
  const { data, error } = await products;
  if (error) throw new Error("Impossibile caricare i prodotti");
  const rows = data ?? [];
  const missing = rows.filter((row) => !row.gtin).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Codici</p>
          <h1>Codici ed etichette</h1>
          <span>
            {rows.length} prodotti · {missing} senza codice a barre
          </span>
        </div>
        <form className={styles.search} method="get">
          <input aria-label="Cerca prodotto" defaultValue={query} name="q" placeholder="Nome, SKU o EAN" type="search" />
          <button className={styles.secondary} type="submit">
            Cerca
          </button>
        </form>
      </header>
      <p className={styles.intro}>
        Il codice a barre della scatola (EAN) serve per controllare il pacco con la scansione e per Google Merchant. Leggilo con la
        fotocamera del telefono o con un lettore, oppure scrivilo. Per i pezzi senza scatola (sfusi, bundle, porta-deck) stampa
        l&rsquo;etichetta con lo SKU: scrivi quante copie e premi Stampa, fino a {LABEL_LIMIT} per volta.
      </p>

      <form action="/admin/inventario/codici/stampa" className={styles.toolbar} id="labels" method="get">
        <span>Etichette 70 × 37 mm, 24 per foglio A4.</span>
        <button className={styles.primary} type="submit">
          Stampa etichette
        </button>
      </form>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Prodotto</th>
            <th>Giacenza</th>
            <th>Codice a barre della scatola</th>
            <th>Copie etichetta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr data-testid="code-row" key={row.id}>
              <td>
                {row.name}
                <small>
                  {row.sku}
                  {row.active ? "" : " · non pubblicato"}
                </small>
              </td>
              <td>{row.stock_quantity}</td>
              <td>
                <GtinCell gtin={row.gtin} productId={row.id} productName={row.name} />
              </td>
              <td>
                <input aria-label={`Copie di ${row.name}`} className={styles.copies} form="labels" max={LABEL_LIMIT} min={0} name={`c-${row.id}`} placeholder="0" type="number" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
