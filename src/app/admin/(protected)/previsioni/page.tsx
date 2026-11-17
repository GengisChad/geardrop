import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { forecastUrgency, loadInventoryForecast, normalizeForecastWindow, type ForecastUrgency } from "@/lib/admin/forecast-repository";
import { formatEuro } from "@/lib/admin/warehouse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });
const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

const URGENCY: Record<ForecastUrgency, { readonly label: string; readonly status: string }> = {
  esaurito: { label: "Esaurito", status: "reversed" },
  "sotto-scorta": { label: "Sotto scorta", status: "reversed" },
  "da-riordinare": { label: "Da riordinare", status: "draft" },
  ok: { label: "Coperto", status: "confirmed" },
  fermo: { label: "Fermo", status: "" },
};

function trendLabel(trend: number | null): string {
  if (trend === null) return "—";
  if (trend >= 1.25) return `↑ ${decimal.format(trend)}×`;
  if (trend <= 0.75) return `↓ ${decimal.format(trend)}×`;
  return `→ ${decimal.format(trend)}×`;
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const window = normalizeForecastWindow(await searchParams);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const rows = await loadInventoryForecast(client, principal.organization.id, window);

  const urgent = rows.filter((row) => ["esaurito", "sotto-scorta"].includes(forecastUrgency(row)) && Number(row.daily_rate) > 0);
  const toReorder = rows.filter((row) => row.suggested_reorder > 0);
  const reorderCost = toReorder.reduce((sum, row) => sum + (row.reorder_cost_cents ?? 0), 0);
  const unpriced = toReorder.filter((row) => row.reorder_cost_cents === null).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Analisi</p>
          <h1>Previsioni</h1>
          <span>Ritmo di vendita dagli ordini pagati · copertura e riordino con {window.leadDays} giorni di consegna e {window.targetDays} di scorta</span>
        </div>
        <Link href="/admin/carichi/nuovo">Nuovo carico</Link>
      </header>

      <section className={styles.metrics} aria-label="Riepilogo previsioni">
        <article className={styles.metric} data-tone={urgent.length ? "warning" : "good"}>
          <span>Urgenti</span>
          <strong>{urgent.length}</strong>
          <small>Esauriti o sotto il punto di riordino, con vendite</small>
        </article>
        <article className={styles.metric}>
          <span>Da riordinare</span>
          <strong>{toReorder.length}</strong>
          <small>Prodotti con quantità consigliata</small>
        </article>
        <article className={styles.metric}>
          <span>Costo riordino</span>
          <strong>{formatEuro(reorderCost)}</strong>
          <small>{unpriced ? `${unpriced} senza costo noto esclusi` : "Al costo medio"}</small>
        </article>
        <article className={styles.metric}>
          <span>Prodotti analizzati</span>
          <strong>{rows.length}</strong>
          <small>Esclusi gli archiviati</small>
        </article>
      </section>

      <form className={`${styles.panel} ${styles.form}`} method="get">
        <label>
          Giorni di consegna del fornitore
          <input defaultValue={window.leadDays} max={365} min={0} name="consegna" type="number" />
        </label>
        <label>
          Giorni di scorta da tenere
          <input defaultValue={window.targetDays} max={365} min={1} name="copertura" type="number" />
        </label>
        <div className={styles.actions}>
          <button className={styles.primary} type="submit">Ricalcola</button>
          <p className={styles.hint}>Ritmo giornaliero = 50% ultima settimana + 30% ultimo mese + 20% ultimi 90 giorni.</p>
        </div>
      </form>

      {rows.length === 0 ? (
        <section className={`${styles.panel} ${styles.empty}`}><strong>Nessun prodotto</strong><p>Le previsioni arrivano con il catalogo e le prime vendite.</p></section>
      ) : (
        <div className={styles.tableWrap}>
          <table data-testid="forecast-table">
            <thead>
              <tr>
                <th>Prodotto</th><th>Stato</th><th className={styles.numeric}>Stock</th><th className={styles.numeric}>7 gg</th>
                <th className={styles.numeric}>30 gg</th><th className={styles.numeric}>90 gg</th><th className={styles.numeric}>Al giorno</th>
                <th>Tendenza</th><th className={styles.numeric}>Copertura</th><th>Esaurimento</th><th className={styles.numeric}>Riordina</th>
                <th className={styles.numeric}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const urgency = URGENCY[forecastUrgency(row)];
                return (
                  <tr key={row.product_id}>
                    <td>
                      <Link href={`/admin/prodotti/${row.product_id}`}>{row.name}</Link>
                      <small className={styles.mono}>{row.sku}</small>
                      {row.preorder_backlog > 0 ? <small>{row.preorder_backlog} in pre-ordine da servire</small> : null}
                      {row.incoming_quantity > 0 ? <small>{row.incoming_quantity} in arrivo (bozze)</small> : null}
                    </td>
                    <td><span className={styles.status} data-status={urgency.status}>{urgency.label}</span></td>
                    <td className={styles.numeric}>{row.unlimited_stock ? "su ordinazione" : row.stock_quantity}</td>
                    <td className={styles.numeric}>{row.sold_7}</td>
                    <td className={styles.numeric}>{row.sold_30}</td>
                    <td className={styles.numeric}>{row.sold_90}</td>
                    <td className={styles.numeric}>{decimal.format(Number(row.daily_rate))}</td>
                    <td>{trendLabel(row.trend === null ? null : Number(row.trend))}</td>
                    <td className={styles.numeric}>{row.days_of_cover === null ? "—" : `${decimal.format(Number(row.days_of_cover))} gg`}</td>
                    <td>{row.stockout_date ? date.format(new Date(`${row.stockout_date}T12:00:00Z`)) : "—"}</td>
                    <td className={styles.numeric}><strong>{row.suggested_reorder || "—"}</strong></td>
                    <td className={styles.numeric}>{row.suggested_reorder ? formatEuro(row.reorder_cost_cents) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
