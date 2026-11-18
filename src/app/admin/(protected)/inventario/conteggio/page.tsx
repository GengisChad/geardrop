import Link from "next/link";
import { redirect } from "next/navigation";
import { CountSheet } from "@/components/admin/inventory/count-sheet";
import styles from "@/components/admin/inventory/inventory.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadStockCountRows } from "@/lib/admin/stock-count-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** "Conteggio inventario" (owner, 2026-11-18): the physical count, applied from the panel. */
export default async function StockCountPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const rows = await loadStockCountRows(client, principal.organization.id);
  const onOrders = rows.reduce((sum, row) => sum + row.onOrders, 0);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Inventario</p>
          <h1>Conteggio inventario</h1>
          <span>
            {rows.length} prodotti · {onOrders} pezzi sullo scaffale per ordini pagati non ancora spediti
          </span>
        </div>
        <Link href="/admin/inventario">Torna all&rsquo;inventario</Link>
      </header>
      <p>
        Scrivi quanti pezzi hai contato davvero, compresi quelli già venduti ma non ancora spediti: il pannello li toglie da solo e
        mostra la nuova giacenza prima di applicarla. Lascia vuoto ciò che non hai contato. Ogni correzione resta nei movimenti con la
        data del conteggio. I pezzi in pre-ordine non sono sullo scaffale e non contano.
      </p>
      <CountSheet rows={rows} />
    </div>
  );
}
