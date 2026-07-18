import Link from "next/link";
import styles from "@/components/admin/orders/orders.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminOrders } from "@/lib/admin/order-repository";
import { normalizeAdminOrderQuery, orderPiiVisibility } from "@/lib/admin/orders";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
const statusLabels = { pending: "In attesa", confirmed: "Confermato", processing: "In lavorazione", shipped: "Spedito", completed: "Completato", cancelled: "Annullato" } as const;
const paymentLabels = { pending: "In attesa", authorized: "Autorizzato", paid: "Pagato", failed: "Fallito", refunded: "Rimborsato" } as const;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = normalizeAdminOrderQuery(params);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const result = await listAdminOrders(client, query, principal.role);
  const hrefFor = (page: number) => ({ pathname: "/admin/ordini", query: { ...params, page: String(page) } });
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "page") exportParams.set(key, value);

  return <div className={styles.page}>
    <header className={styles.heading}><div><p>Commerce / Operazioni</p><h1>Ordini</h1><span>{result.total} ordini reali · nessun dato dimostrativo</span></div>{orderPiiVisibility(principal.role).export ? <Link href={`/admin/ordini/export?${exportParams}`}>Esporta CSV</Link> : null}</header>
    <form className={styles.filters} method="get">
      <label>Numero o email<input defaultValue={query.q} name="q" placeholder="GD-00000001"/></label>
      <label>Dal<input defaultValue={query.from ?? ""} name="from" type="date"/></label><label>Al<input defaultValue={query.to ?? ""} name="to" type="date"/></label>
      <label>Stato<select defaultValue={query.status} name="status"><option value="all">Tutti</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Pagamento<select defaultValue={query.payment} name="payment"><option value="all">Tutti</option>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Spedizione<input defaultValue={query.shipping} name="shipping" placeholder="standard"/></label>
      <label>Coupon<input defaultValue={query.coupon} name="coupon" placeholder="CODICE"/></label>
      <div className={styles.filterActions}><button type="submit">Filtra</button><Link href="/admin/ordini">Azzera</Link></div>
    </form>
    {result.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Ordine</th><th>Cliente</th><th>Data</th><th>Stato</th><th>Pagamento</th><th>Spedizione</th><th>Coupon</th><th>Totale</th></tr></thead><tbody>{result.items.map((order)=><tr key={order.id}><td><Link href={`/admin/ordini/${order.id}`}>{order.order_number}</Link><small>#{order.id}</small></td><td>{order.email}</td><td>{new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(order.created_at))}</td><td><span className={styles.badge}>{statusLabels[order.status]}</span></td><td>{paymentLabels[order.payment_status]}</td><td>{order.shipping_method_code}</td><td>{order.coupon_code ?? "—"}</td><td>{formatPrice({amount:order.total_cents,currency:"EUR"})}</td></tr>)}</tbody></table></div>:<p className={styles.empty}>Nessun ordine corrisponde ai filtri. Il database può essere vuoto.</p>}
    <nav className={styles.pagination} aria-label="Paginazione ordini">{result.page>1?<Link href={hrefFor(result.page-1)}>Precedente</Link>:<span/>}<span>Pagina {result.page} di {result.pageCount}</span>{result.page<result.pageCount?<Link href={hrefFor(result.page+1)}>Successiva</Link>:<span/>}</nav>
  </div>;
}
