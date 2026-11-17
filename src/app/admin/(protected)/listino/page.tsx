import Link from "next/link";
import { redirect } from "next/navigation";
import { CostImportForm } from "@/components/admin/warehouse/cost-import-form";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { priceListRows, priceListTotals } from "@/lib/admin/price-list";
import { formatEuro } from "@/lib/admin/warehouse";
import { loadCostDefaults, loadPriceListSources, loadWarehouseSummary } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/**
 * Listino e margini (owner, 2026-11-17): what each product costs, what it sells for, and what
 * the pieces on the shelf can earn at list price. Costs are owners' and admins' business.
 */
export default async function PriceListPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;

  const [sources, defaults, summary] = await Promise.all([
    loadPriceListSources(client, organizationId),
    loadCostDefaults(client, organizationId),
    loadWarehouseSummary(client, organizationId),
  ]);
  const rows = priceListRows(sources, defaults.vatRateBp);
  const totals = priceListTotals(rows);
  const vatLabel = `IVA ${(defaults.vatRateBp / 100).toLocaleString("it-IT")}%`;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Costi e ricavi</p>
          <h1>Listino e margini</h1>
          <span>
            {rows.length} prodotti a catalogo · {totals.pieces} pezzi a scaffale · margini al netto di {vatLabel}, prima di corriere, commissioni e imballo
          </span>
        </div>
        <Link href="/admin/carichi/nuovo">Nuovo carico</Link>
      </header>

      <section className={styles.metrics} aria-label="Stima dello scaffale a prezzo di listino">
        <article className={styles.metric}>
          <span>Valore a costo</span>
          <strong data-testid="list-stock-value">{formatEuro(totals.stockValueCents)}</strong>
          <small>Giacenza × costo medio</small>
        </article>
        <article className={styles.metric}>
          <span>Incasso a listino</span>
          <strong data-testid="list-potential-gross">{formatEuro(totals.potentialGrossCents)}</strong>
          <small>{formatEuro(totals.potentialNetCents)} al netto di {vatLabel}</small>
        </article>
        <article className={styles.metric} data-tone="good">
          <span>Margine potenziale</span>
          <strong data-testid="list-potential-margin">{formatEuro(totals.potentialMarginCents)}</strong>
          <small>{percent(totals.marginPercent)} sul ricavo netto dei prodotti con costo</small>
        </article>
        <article className={styles.metric} data-tone={totals.productsWithoutCost > 0 ? "warning" : undefined}>
          <span>Senza costo</span>
          <strong data-testid="list-missing-cost">{totals.productsWithoutCost}</strong>
          <small>
            {totals.productsWithoutCost > 0
              ? `${totals.piecesWithoutCost} pezzi, ${formatEuro(totals.uncoveredNetCents)} di ricavo netto fuori dal margine`
              : "Ogni pezzo a scaffale ha il suo costo"}
          </small>
        </article>
      </section>

      <section className={styles.metrics} aria-label={`Venduto negli ultimi ${summary.periodDays} giorni`}>
        <article className={styles.metric}>
          <span>Ricavo netto · {summary.periodDays} giorni</span>
          <strong>{formatEuro(summary.revenueNetCents)}</strong>
          <small>Ordini con tutti i costi</small>
        </article>
        <article className={styles.metric}>
          <span>Profitto · {summary.periodDays} giorni</span>
          <strong>{formatEuro(summary.profitCents)}</strong>
          <small>Dopo merce, corriere, commissioni e imballo</small>
        </article>
        <article className={styles.metric}>
          <span>Ordini calcolati</span>
          <strong>{summary.completeOrders}</strong>
          <small>Profitto completo</small>
        </article>
        <article className={styles.metric} data-tone={summary.incompleteOrders > 0 ? "warning" : undefined}>
          <span>Ordini incompleti</span>
          <strong>{summary.incompleteOrders}</strong>
          <small><Link href="/admin/ordini">Manca un costo: vedi gli ordini</Link></small>
        </article>
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <p>Prodotto per prodotto</p>
            <h2>Costo, prezzo e scaffale</h2>
            <span>Dal più pesante sull&apos;incasso. Il costo si imposta dalla scheda del prodotto o con il riquadro qui sotto.</span>
          </div>
        </header>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nessun prodotto a catalogo</strong>
            <p>Il listino si riempie con i prodotti di questa azienda, archiviati esclusi.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table data-testid="price-list">
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th className={styles.numeric}>Pezzi</th>
                  <th className={styles.numeric}>Costo</th>
                  <th className={styles.numeric}>Listino</th>
                  <th className={styles.numeric}>Netto IVA</th>
                  <th className={styles.numeric}>Margine pezzo</th>
                  <th className={styles.numeric}>Margine %</th>
                  <th className={styles.numeric}>Valore a costo</th>
                  <th className={styles.numeric}>Incasso a listino</th>
                  <th className={styles.numeric}>Margine scaffale</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr data-testid={`price-row-${row.sku}`} key={row.productId}>
                    <td>
                      <Link href={`/admin/prodotti/${row.productId}`}>{row.name}</Link>
                      <br />
                      <small className={styles.mono}>{row.sku}</small>
                    </td>
                    <td className={styles.numeric}>{row.unlimitedStock ? <small>su ordinazione</small> : row.quantity}</td>
                    <td className={styles.numeric}>
                      {row.averageCostCents === null ? (
                        <Link className={styles.missing} data-testid="list-cost-missing" href={`/admin/prodotti/${row.productId}`}>
                          costo mancante
                        </Link>
                      ) : (
                        formatEuro(row.averageCostCents)
                      )}
                    </td>
                    <td className={styles.numeric}>{formatEuro(row.priceCents)}</td>
                    <td className={styles.numeric}>{formatEuro(row.netPriceCents)}</td>
                    <td className={styles.numeric}>{formatEuro(row.unitMarginCents)}</td>
                    <td className={styles.numeric}>{percent(row.marginPercent)}</td>
                    <td className={styles.numeric}>{row.unlimitedStock ? "—" : formatEuro(row.stockValueCents)}</td>
                    <td className={styles.numeric}>{row.unlimitedStock ? "—" : formatEuro(row.potentialGrossCents)}</td>
                    <td className={styles.numeric}>{row.unlimitedStock ? "—" : formatEuro(row.potentialMarginCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.hint}>
          È una stima a prezzo pieno: sconti, kit, codici club e pezzi invenduti la abbassano. Il profitto vero di ogni vendita è
          nella colonna Profitto degli ordini.
        </p>
      </section>

      {principal.role === "owner" ? <CostImportForm /> : null}
    </div>
  );
}
