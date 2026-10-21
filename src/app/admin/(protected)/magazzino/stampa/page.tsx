import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/fulfillment/fulfillment.module.css";
import { PrintButton } from "@/components/admin/fulfillment/station-controls";
import { requireAdminAccess } from "@/lib/admin/access";
import { pickList, selectedOrderIds } from "@/lib/admin/fulfillment";
import { loadOrdersForPrint, loadSenderAddress } from "@/lib/admin/fulfillment-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function WarehousePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ids = selectedOrderIds((await searchParams).ordini);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const [orders, sender] = await Promise.all([
    loadOrdersForPrint(client, organizationId, ids),
    loadSenderAddress(client, organizationId),
  ]);
  const rows = pickList(orders);

  return (
    <div className={styles.sheet} data-testid="print-sheet">
      <div className={styles.printBar}>
        <PrintButton />
        <Link className={styles.secondary} href="/admin/magazzino">Torna alla stazione</Link>
        <span>{orders.length} ordini · etichette 100 × 150 mm</span>
      </div>

      {orders.length === 0 ? (
        <p>Nessun ordine selezionato.</p>
      ) : (
        <>
          <section className={styles.pickSection} aria-label="Lista di prelievo">
            <h2>Lista di prelievo</h2>
            <table className={styles.pickTable}>
              <thead>
                <tr><th /><th>SKU</th><th>Prodotto</th><th className={styles.num}>Da prelevare</th><th className={styles.num}>Pre-ordine</th><th className={styles.num}>Ordini</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sku}>
                    <td className={styles.box}><span /></td>
                    <td>{row.sku}</td>
                    <td>{row.name}</td>
                    <td className={styles.num}>{row.quantity}</td>
                    <td className={styles.num}>{row.preorderQuantity || ""}</td>
                    <td className={styles.num}>{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.labels} aria-label="Etichette">
            {orders.map((order) => (
              <article className={styles.label} data-testid="shipping-label" key={order.id}>
                <div className={styles.from}>
                  Mittente: <b>{sender.name}</b><br />
                  {[sender.street, `${sender.postalCode} ${sender.city}`.trim(), sender.country].filter(Boolean).join(" · ")}
                  {sender.phone ? <><br />Tel. {sender.phone}</> : null}
                </div>
                <div className={styles.to}>
                  <strong>{order.address.name}</strong>
                  <span>{order.address.street}</span>
                  <span>{order.address.postalCode} {order.address.city} {order.address.province ? `(${order.address.province})` : ""}</span>
                  <span>{order.address.country}</span>
                  {order.address.phone ? <span>Tel. {order.address.phone}</span> : null}
                  {order.notes ? <p className={styles.slip}>Note: {order.notes}</p> : null}
                  <div className={styles.slip}>
                    Contenuto:
                    <ul>{order.lines.map((line, index) => <li key={`${line.sku}-${index}`}>{line.quantity} × {line.name}</li>)}</ul>
                  </div>
                </div>
                <div className={styles.meta}>
                  <b>{order.orderNumber}</b>
                  <span>{order.shippingMethodCode}</span>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
