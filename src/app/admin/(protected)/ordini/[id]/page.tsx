import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderActions } from "@/components/admin/orders/order-actions";
import { OrderProfitPanel } from "@/components/admin/warehouse/order-profit-panel";
import styles from "@/components/admin/orders/orders.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminOrderDetail } from "@/lib/admin/order-repository";
import { addressLines, shipmentChoice } from "@/lib/admin/orders";
import { loadOrderProfits } from "@/lib/admin/warehouse-repository";
import { CONSIGNMENT_PARTNER, partnerLines } from "@/data/catalog";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const statusLabels = { pending: "In attesa", confirmed: "Confermato", processing: "In lavorazione", shipped: "Spedito", completed: "Completato", cancelled: "Annullato" } as const;
const paymentLabels = { pending: "In attesa", authorized: "Autorizzato", paid: "Pagato", failed: "Fallito", refunded: "Rimborsato" } as const;
const money = (amount:number)=>formatPrice({amount,currency:"EUR"});

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const client = await createSupabaseServerClient(); const principal = await requireAdminAccess(client); if(principal.role === "editor")redirect("/admin"); const data = await loadAdminOrderDetail(client,principal.organization.id,id,principal.role); if(!data)notFound(); const profit = (await loadOrderProfits(client,principal.organization.id,[id])).get(id) ?? null;
  const order=data.order; const shipping=addressLines(order.shipping_address_snapshot); const billing=addressLines(order.billing_address_snapshot); const choice=shipmentChoice(order.shipping_address_snapshot);
  // Partner consignment lines derived from the live catalogue by SKU.
  const pLines = partnerLines(data.items.map(i=>({slug:i.sku_snapshot,name:i.product_name_snapshot,quantity:i.quantity,unitPriceCents:i.unit_price_cents})));
  const partnerOwed = pLines.reduce((sum,l)=>sum+l.owed,0);
  const partnerSlugs = new Set(pLines.map(l=>l.slug));
  return <div className={styles.page}>
    <header className={styles.heading}><div><p>Ordini / {order.order_number}</p><h1>{order.order_number}</h1><span>Snapshot immutabile · creato {new Intl.DateTimeFormat("it-IT",{dateStyle:"long",timeStyle:"short"}).format(new Date(order.created_at))}</span></div><Link href="/admin/ordini">Torna agli ordini</Link></header>
    {!data.piiVisible?<p className={styles.notice}>Email mascherata e indirizzi nascosti per il ruolo editor.</p>:null}
    <section className={styles.summary}><article><span>Stato</span><strong>{statusLabels[order.status]}</strong></article><article><span>Pagamento</span><strong>{paymentLabels[order.payment_status]}</strong></article><article><span>Totale</span><strong>{money(order.total_cents)}</strong></article><article><span>Spedizione</span><strong>{order.shipping_method_code}</strong></article></section>
    {pLines.length>0?<section className={styles.panel} style={{borderLeft:"4px solid #86efac",background:"#f0fdf4"}}><h2>Spedisce {CONSIGNMENT_PARTNER.name}</h2><ul>{pLines.map(l=><li key={l.slug}>{l.name} &times; {l.quantity}</li>)}</ul><p><strong>Da bonificare a {CONSIGNMENT_PARTNER.name}:</strong> {money(partnerOwed)}</p><p className={styles.notice}>Bonifico manuale — non automatico.</p></section>:null}
    <div className={styles.detailGrid}>
      <section className={styles.panel}><h2>Cliente</h2><dl><dt>Email</dt><dd>{order.email}</dd><dt>Telefono</dt><dd>{order.phone??"—"}</dd><dt>Coupon</dt><dd>{order.coupon_code??"—"}</dd></dl>{data.piiVisible?<><h3>Spedizione scelta</h3><p>{choice.label??"Poste Italiane (standard)"}</p>{choice.pickupPoint?<p><strong>Punto InPost:</strong> {choice.pickupPoint}</p>:null}<h3>Indirizzo spedizione</h3>{shipping.length?<ul>{shipping.map((line,index)=><li key={`${line}-${index}`}>{line}</li>)}</ul>:<p>Nessun dettaglio disponibile.</p>}<h3>Indirizzo fatturazione</h3>{billing.length?<ul>{billing.map((line,index)=><li key={`${line}-${index}`}>{line}</li>)}</ul>:<p>Nessun dettaglio disponibile.</p>}</>:null}</section>
      <section className={styles.panel}><h2>Totali autorevoli</h2><dl><dt>Subtotale</dt><dd>{money(order.subtotal_cents)}</dd><dt>Sconto</dt><dd>−{money(order.discount_cents)}</dd><dt>Spedizione</dt><dd>{money(order.shipping_cents)}</dd><dt>Totale</dt><dd>{money(order.total_cents)}</dd><dt>Rimborso preparato</dt><dd>{order.refund_amount_cents?money(order.refund_amount_cents):"—"}</dd><dt>Motivazione</dt><dd>{order.refund_reason??"—"}</dd></dl><h3>Tracking</h3><p>{order.tracking_carrier&&order.tracking_code?`${order.tracking_carrier} · ${order.tracking_code}`:"Non impostato"}</p>{order.tracking_url?<a href={order.tracking_url} rel="noreferrer" target="_blank">Apri tracking</a>:null}</section>
      <section className={`${styles.panel} ${styles.wide}`}><h2>Righe ordine immutabili</h2><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Prodotto snapshot</th><th>SKU</th><th>Quantità</th><th>Prezzo unitario</th><th>Totale riga</th><th>Disponibilità</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.product_name_snapshot}{partnerSlugs.has(item.sku_snapshot)?<><br/><small>Spedito da {CONSIGNMENT_PARTNER.name}</small></>:null}</td><td>{item.sku_snapshot}</td><td>{item.quantity}</td><td>{money(item.unit_price_cents)}</td><td>{money(item.line_total_cents)}</td><td>{item.preorder_quantity>0?<strong>{item.preorder_quantity>=item.quantity?"Pre-ordine":`Pre-ordine: ${item.preorder_quantity} di ${item.quantity}`}</strong>:item.reservation_kind==="preorder"?<strong>Pre-ordine</strong>:"Magazzino"}</td></tr>)}</tbody></table></div></section>
      <section className={styles.panel}><h2>Note interne</h2>{data.notes.length?<ul className={styles.timeline}>{data.notes.map(note=><li key={note.id}><strong>{note.note}</strong><time>{new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(note.created_at))}</time></li>)}</ul>:<p>Nessuna nota.</p>}</section>
      <section className={styles.panel}><h2>Storico stato</h2>{data.statusEvents.length?<ul className={styles.timeline}>{data.statusEvents.map(event=><li key={event.id}><strong>{event.from_status?`${statusLabels[event.from_status]} → `:""}{statusLabels[event.to_status]}</strong>{event.note?<span>{event.note}</span>:null}<time>{new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</time></li>)}</ul>:<p>Nessun evento.</p>}</section>
      <section className={`${styles.panel} ${styles.wide}`}><h2>Azioni auditate</h2>{data.auditEvents.length?<ul className={styles.timeline}>{data.auditEvents.map(event=><li key={event.id}><strong>{event.action}</strong><time>{new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</time></li>)}</ul>:<p>Nessuna azione registrata.</p>}</section>
    </div>
    <OrderProfitPanel orderId={order.id} overrides={{shippingCostCents:order.shipping_cost_cents,packagingCostCents:order.packaging_cost_cents,paymentFeeCents:order.payment_fee_cents,paymentFeeSource:order.payment_fee_source}} profit={profit}/>
    <OrderActions orderId={order.id} paymentStatus={order.payment_status} role={principal.role} status={order.status} tracking={{carrier:order.tracking_carrier,code:order.tracking_code,url:order.tracking_url}} suggestedCarrierId={choice.method?.startsWith("inpost")?"inpost":"poste"} shippingNotifiedAt={order.shipping_notified_at} deliveryNotifiedAt={order.delivery_notified_at} stripePaymentIntentId={order.stripe_payment_intent_id} totalCents={order.total_cents} refundedCents={order.refunded_cents}/>
  </div>;
}
