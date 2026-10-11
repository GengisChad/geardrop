import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/orders/orders.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listPreorderOrders } from "@/lib/admin/order-repository";
import { normalizePreorderView, preorderBoard, type PreorderView } from "@/lib/admin/preorders";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const money = (amount: number) => formatPrice({ amount, currency: "EUR" });
const date = (value: string) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusLabels = { pending: "In attesa", confirmed: "Da spedire", processing: "In lavorazione", shipped: "Spedito", completed: "Consegnato", cancelled: "Annullato" } as const;
const VIEWS: readonly { readonly value: PreorderView; readonly label: string }[] = [
  { value: "da-evadere", label: "Da evadere" },
  { value: "evasi", label: "Già spediti" },
  { value: "tutti", label: "Tutti" },
];

/**
 * The pre-order desk (owner, 2026-10-11): who paid for which pre-order and whether it has shipped.
 * When the pieces land, ship from the top of "Da evadere": the first to pay is the first served.
 */
export default async function AdminPreordersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = normalizePreorderView(params["vista"]);
  const sku = typeof params["prodotto"] === "string" && params["prodotto"] ? params["prodotto"] : undefined;
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  // Buyer names and addresses: managers only, the same gate as the rest of the orders section.
  if (principal.role === "editor") redirect("/admin");

  const { items, orders } = await listPreorderOrders(client);
  const board = preorderBoard(items, orders, { view, ...(sku ? { sku } : {}) });
  const hrefFor = (next: { vista?: PreorderView; prodotto?: string | null }) => {
    const query: Record<string, string> = {};
    const nextView = next.vista ?? view;
    if (nextView !== "da-evadere") query["vista"] = nextView;
    const nextSku = next.prodotto === undefined ? sku : next.prodotto;
    if (nextSku) query["prodotto"] = nextSku;
    return { pathname: "/admin/ordini/pre-ordini", query };
  };
  const selected = board.products.find((product) => product.sku === sku);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Ordini / Pre-ordini</p>
          <h1>Pre-ordini</h1>
          <span>Chi ha pagato un pre-ordine, per quale pezzo e se è già partito. Si spedisce dall&apos;alto: chi ha pagato prima.</span>
        </div>
        <Link href="/admin/ordini">Torna agli ordini</Link>
      </header>

      <section className={styles.summary} data-testid="preorder-summary">
        <article><span>Ordini da evadere</span><strong>{board.openOrders}</strong></article>
        <article><span>Pezzi da spedire</span><strong>{board.openPieces}</strong></article>
        <article><span>Prodotti in pre-ordine</span><strong>{board.products.filter((product) => product.openPieces > 0).length}</strong></article>
        <article><span>Già spediti</span><strong>{board.products.reduce((sum, product) => sum + product.shippedPieces, 0)} pezzi</strong></article>
      </section>

      <section className={styles.panel}>
        <h2>Per prodotto</h2>
        <p>Quanti pezzi tenere da parte quando arriva la merce. Clicca un prodotto per vedere solo i suoi ordini.</p>
        {board.products.length === 0 ? (
          <p className={styles.empty}>Nessun pre-ordine pagato al momento.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="preorder-products">
              <thead><tr><th>Prodotto</th><th>Pezzi da spedire</th><th>Ordini da evadere</th><th>Già spediti</th></tr></thead>
              <tbody>
                {board.products.map((product) => (
                  <tr key={product.sku}>
                    <td><Link href={hrefFor({ prodotto: product.sku })}>{product.name}</Link></td>
                    <td><strong>{product.openPieces}</strong></td>
                    <td>{product.openOrders}</td>
                    <td>{product.shippedPieces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav className={styles.filters} aria-label="Filtra i pre-ordini" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        {VIEWS.map((option) =>
          option.value === view ? (
            <strong key={option.value} aria-current="page">{option.label}</strong>
          ) : (
            <Link key={option.value} href={hrefFor({ vista: option.value })}>{option.label}</Link>
          ),
        )}
        {selected ? (
          <span>
            Solo <strong>{selected.name}</strong> · <Link href={hrefFor({ prodotto: null })}>Mostra tutti i prodotti</Link>
          </span>
        ) : null}
      </nav>

      {board.orders.length === 0 ? (
        <p className={styles.empty}>
          {view === "da-evadere" ? "Nessun pre-ordine da spedire." : view === "evasi" ? "Nessun pre-ordine ancora spedito." : "Nessun pre-ordine pagato."}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="preorder-orders">
            <thead>
              <tr><th>#</th><th>Ordine</th><th>Pagato il</th><th>Cliente</th><th>Pre-ordine</th><th>Spedizione</th><th>Stato</th><th>Totale pagato</th></tr>
            </thead>
            <tbody>
              {board.orders.map((order, index) => (
                <tr key={order.id}>
                  <td>{index + 1}</td>
                  <td><Link href={`/admin/ordini/${order.id}`}>{order.orderNumber}</Link></td>
                  <td>{date(order.createdAt)}</td>
                  <td>
                    <strong>{order.buyer ?? "—"}</strong>
                    <br />
                    <a href={`mailto:${order.email}`}>{order.email}</a>
                    {order.phone ? <><br />{order.phone}</> : null}
                  </td>
                  <td>
                    {order.lines.map((line) => (
                      <div key={line.sku}>
                        {line.name} × <strong>{line.preordered}</strong>
                        {line.quantity > line.preordered ? <small> (altri {line.quantity - line.preordered} già dal magazzino)</small> : null}
                      </div>
                    ))}
                  </td>
                  <td>{order.destination ?? "—"}</td>
                  <td>
                    <span className={styles.badge}>{statusLabels[order.status]}</span>
                    {order.trackingCode ? <><br /><small>{order.trackingCode}</small></> : null}
                  </td>
                  <td>{money(order.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.notice} style={{ marginTop: "1rem" }}>
        Per spedire un pre-ordine apri l&apos;ordine, inserisci il tracking e segnalo come spedito: il cliente riceve l&apos;email e
        l&apos;ordine passa in &quot;Già spediti&quot;.
      </p>
    </div>
  );
}
