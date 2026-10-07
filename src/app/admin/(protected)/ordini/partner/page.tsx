import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/orders/orders.module.css";
import { CONSIGNMENT_PARTNER, partnerLines, PRODUCTS } from "@/data/catalog";
import { requireAdminAccess } from "@/lib/admin/access";
import { listPartnerOrders } from "@/lib/admin/order-repository";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const money = (amount: number) => formatPrice({ amount, currency: "EUR" });

// The slugs of all consignment products: we ask the DB only for orders containing these.
const CONSIGNMENT_SLUGS = PRODUCTS.filter((p) => p.consignment).map((p) => p.slug as string);

export default async function AdminPartnerOrdersPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  // Managers only: same PII gate as the rest of the orders section.
  if (principal.role === "editor") redirect("/admin");

  const groups = await listPartnerOrders(client, principal.organization.id, CONSIGNMENT_SLUGS);

  // Compute totals per order from the live catalogue.
  const rows = groups.map(({ order, items }) => {
    const pLines = partnerLines(
      items.map((i) => ({ slug: i.sku_snapshot, name: i.product_name_snapshot, quantity: i.quantity, unitPriceCents: i.unit_price_cents })),
    );
    const owedCents = pLines.reduce((sum, l) => sum + l.owed, 0);
    const pieces = pLines.reduce((sum, l) => sum + l.quantity, 0);
    return { order, pLines, owedCents, pieces };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.owedCents, 0);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Ordini / Partner</p>
          <h1>Ordini {CONSIGNMENT_PARTNER.name}</h1>
          <span>Ordini pagati con articoli in conto vendita · sola lettura · bonifico manuale. Il totale comprende anche gli ordini già bonificati: confronta le date con l&apos;ultimo bonifico.</span>
        </div>
        <Link href="/admin/ordini">Torna agli ordini</Link>
      </header>

      <section className={styles.panel} style={{ marginBottom: "1.5rem" }}>
        <p>
          Questi ordini contengono prodotti spediti da <strong>{CONSIGNMENT_PARTNER.name}</strong>.
          Per ogni ordine l&apos;importo da bonificare è calcolato dal catalogo (prezzo − commissione × quantità).
          Il bonifico è manuale.
        </p>
      </section>

      {rows.length === 0 ? (
        <p className={styles.empty}>Nessun ordine pagato con articoli {CONSIGNMENT_PARTNER.name} al momento.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Data</th>
                  <th>Articoli partner</th>
                  <th>Pezzi</th>
                  <th>Da bonificare</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, pLines, owedCents, pieces }) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/ordini/${order.id}`}>{order.order_number}</Link>
                    </td>
                    <td>
                      {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(order.created_at),
                      )}
                    </td>
                    <td>{pLines.map((l) => `${l.name} ×${l.quantity}`).join(", ")}</td>
                    <td>{pieces}</td>
                    <td>
                      <strong>{money(owedCents)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    <strong>Totale da bonificare</strong>
                  </td>
                  <td>
                    <strong>{money(grandTotal)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={styles.notice} style={{ marginTop: "1rem" }}>
            Il bonifico è manuale. Contatta {CONSIGNMENT_PARTNER.name} all&apos;indirizzo{" "}
            <a href={`mailto:${CONSIGNMENT_PARTNER.email}`}>{CONSIGNMENT_PARTNER.email}</a> per concordare i pagamenti.
          </p>
        </>
      )}
    </div>
  );
}
