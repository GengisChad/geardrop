import Link from "next/link";
import { InventoryAdjustmentForm } from "@/components/admin/inventory/inventory-adjustment-form";
import styles from "@/components/admin/inventory/inventory.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminInventory, normalizeAdminInventoryQuery } from "@/lib/admin/inventory-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const reasons = {
  initial: "Iniziale",
  manual_adjustment: "Rettifica",
  order_reserved: "Ordine riservato",
  order_cancelled: "Ordine annullato",
  return: "Reso",
  damage: "Danno",
} as const;

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = normalizeAdminInventoryQuery(params);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const page = await listAdminInventory(client, query);
  const hrefFor = (nextPage: number) => ({ pathname: "/admin/inventario", query: { ...params, page: String(nextPage) } });
  const canAdjust = principal.role === "owner" || principal.role === "admin";

  return <div className={styles.page}>
    <header className={styles.heading}><div><p>Catalogo / Operazioni</p><h1>Inventario</h1><span>{page.total} prodotti reali · ultimi {page.movements.length} movimenti visibili</span></div></header>
    <form className={styles.filters} method="get">
      <label>Cerca<input defaultValue={query.q} name="q" placeholder="Nome, SKU o slug" /></label>
      <label className={styles.checkbox}><input defaultChecked={query.lowStock} name="lowStock" type="checkbox" value="true" />Solo stock basso</label>
      <button type="submit">Filtra</button><Link href="/admin/inventario">Azzera</Link>
    </form>

    {canAdjust ? <InventoryAdjustmentForm /> : <section className={styles.readOnly}><h2>Consultazione inventario</h2><p>Il ruolo editor può leggere stock e movimenti. Le rettifiche richiedono owner o admin.</p></section>}

    <section className={styles.panel}>
      <header><h2>Stock prodotti</h2><span>Valori generati dal database, non ricalcolati nella UI.</span></header>
      <div className={styles.tableWrap}><table><thead><tr><th>Prodotto</th><th>SKU</th><th>Stock reale</th><th>Override</th><th>Stato effettivo</th><th>Acquistabile</th><th>Aggiornato</th></tr></thead>
        <tbody>{page.items.map((product) => <tr key={product.id}>
          <td><Link href={`/admin/prodotti/${product.id}`}>{product.name}</Link>{product.is_low_stock ? <small>stock basso</small> : null}</td>
          <td className={styles.mono}>{product.sku}</td><td className={styles.numeric}>{product.stock_quantity}</td>
          <td>{product.availability_override ?? "Nessuno"}</td><td><span className={styles.status} data-status={product.stock_status}>{product.stock_status}</span></td>
          <td>{product.is_purchasable ? "Sì" : "No"}</td><td><time dateTime={product.updated_at}>{date.format(new Date(product.updated_at))}</time></td>
        </tr>)}</tbody></table></div>
      {page.items.length === 0 ? <div className={styles.empty}><h2>Nessun prodotto in inventario</h2><p>Il database non contiene prodotti corrispondenti ai filtri.</p><Link href="/admin/prodotti/nuovo">Crea prodotto</Link></div> : null}
      <nav className={styles.pagination} aria-label="Paginazione inventario">{page.page > 1 ? <Link href={hrefFor(page.page - 1)}>Precedente</Link> : <span />}<span>Pagina {page.page} di {page.pageCount}</span>{page.page < page.pageCount ? <Link href={hrefFor(page.page + 1)}>Successiva</Link> : <span />}</nav>
    </section>

    <section className={styles.panel}><header><h2>Movimenti recenti</h2><span>Registro append-only restituito da inventory_movements.</span></header>
      {page.movements.length === 0 ? <div className={styles.empty}><p>Nessun movimento registrato.</p></div> : <div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Prodotto</th><th>Causale</th><th>Delta</th><th>Stock dopo</th><th>Nota</th></tr></thead><tbody>
        {page.movements.map((movement) => <tr key={movement.id}><td><time dateTime={movement.created_at}>{date.format(new Date(movement.created_at))}</time></td><td><strong>{movement.productName}</strong><small className={styles.mono}>{movement.productSku}</small></td><td>{reasons[movement.reason]}</td><td className={styles.numeric}>{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</td><td className={styles.numeric}>{movement.stock_after}</td><td>{movement.note ?? "—"}</td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
