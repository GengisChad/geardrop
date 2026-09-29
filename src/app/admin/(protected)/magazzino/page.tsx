/* eslint-disable @next/next/no-img-element -- order snapshots keep the image path they were sold with */
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/fulfillment/fulfillment.module.css";
import { PreorderQueue } from "@/components/admin/fulfillment/preorder-queue";
import { ClaimOrderButton } from "@/components/admin/fulfillment/station-controls";
import { requireAdminAccess } from "@/lib/admin/access";
import type { PickableLine } from "@/lib/admin/fulfillment";
import { listOrdersToFulfil, loadPreorderQueue, type FulfilmentOrder } from "@/lib/admin/fulfillment-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const pieces = (lines: readonly PickableLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);

function OrderCard({ order, claimable }: { readonly order: FulfilmentOrder; readonly claimable: boolean }) {
  return (
    <article className={styles.order} data-testid="station-order">
      <div className={styles.orderHead}>
        <label>
          <input aria-label={`Seleziona ${order.orderNumber}`} form="print-selection" name="ordini" type="checkbox" value={order.id} />
          <span>
            <Link href={`/admin/ordini/${order.id}`}>{order.orderNumber}</Link>
            <small>{dateTime.format(new Date(order.createdAt))} · {order.shippingMethodCode} · {pieces(order.lines)} pz</small>
          </span>
        </label>

      </div>
      <ul className={styles.lines}>
        {order.lines.map((line, index) => (
          <li key={`${line.sku}-${index}`}>
            <img alt="" height={40} src={line.imageSrc} width={40} />
            <span>{line.name}<small>{line.sku}</small></span>
            <strong>
              ×{line.quantity}
              {line.preorderQuantity > 0 ? <small>{line.preorderQuantity} in pre-ordine</small> : null}
            </strong>
          </li>
        ))}
      </ul>
      <p className={styles.destination}>{order.address.name} · {order.address.postalCode} {order.address.city} {order.address.province ? `(${order.address.province})` : ""}</p>
      {order.notes ? <p className={styles.destination}>Nota cliente: {order.notes}</p> : null}
      <div className={styles.orderActions}>
        {claimable ? <ClaimOrderButton orderId={order.id} /> : null}
        <Link className={styles.secondary} href={{ pathname: "/admin/magazzino/stampa", query: { ordini: String(order.id) } }}>Etichetta</Link>
        <Link className={styles.secondary} href={`/admin/ordini/${order.id}`}>Spedisci</Link>
      </div>
    </article>
  );
}

export default async function WarehouseStationPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const [orders, preorders] = await Promise.all([
    listOrdersToFulfil(client, principal.organization.id),
    loadPreorderQueue(client, principal.organization.id),
  ]);
  // Un pre-ordine si prepara quando la merce è arrivata E il cliente è stato avvisato: fino ad
  // allora resta nella sua colonna, così la coda di oggi contiene solo pacchi che si possono fare.
  const heldBack = new Set(preorders.filter((wait) => !wait.ready || !wait.notifiedAt).map((wait) => wait.orderId));
  const packable = orders.filter((order) => !heldBack.has(order.id));
  const fresh = packable.filter((order) => order.status === "confirmed");
  const inWork = packable.filter((order) => order.status === "processing");
  const toNotify = preorders.filter((wait) => wait.ready && !wait.notifiedAt).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Stazione</p>
          <h1>Da spedire</h1>
          <span>
            {packable.length} da preparare · {preorders.length} in attesa di merce
            {toNotify > 0 ? ` · ${toNotify} da avvisare` : ""}
          </span>
        </div>
      </header>

      <form action="/admin/magazzino/stampa" className={styles.toolbar} id="print-selection" method="get">
        <span>Seleziona gli ordini da preparare: lista di prelievo e etichette in un solo foglio.</span>
        <button className={styles.primary} type="submit">Stampa selezionati</button>
      </form>

      {orders.length === 0 ? (
        <section className={styles.empty}>
          <strong>Nessun ordine da spedire</strong>
          <p>Gli ordini pagati compaiono qui appena arrivano.</p>
        </section>
      ) : (
        <div className={styles.columns}>
          <section className={styles.column} aria-labelledby="nuovi-title">
            <h2 id="nuovi-title">Da preparare · {fresh.length}</h2>
            {fresh.length === 0 ? <p>Nessun ordine da preparare.</p> : fresh.map((order) => <OrderCard claimable key={order.id} order={order} />)}
          </section>
          <section className={styles.column} aria-labelledby="lavorazione-title">
            <h2 id="lavorazione-title">In lavorazione · {inWork.length}</h2>
            {inWork.length === 0 ? <p>Nessun ordine preso in carico.</p> : inWork.map((order) => <OrderCard claimable={false} key={order.id} order={order} />)}
          </section>
        </div>
      )}

      {preorders.length > 0 ? <PreorderQueue waits={preorders} /> : null}
    </div>
  );
}
