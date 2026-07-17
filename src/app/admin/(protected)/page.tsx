import { ArrowUpRight, Boxes, ImagePlus, PackagePlus, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminDashboard } from "@/lib/admin/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const numberFormat = new Intl.NumberFormat("it-IT");
const dateFormat = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export default async function AdminDashboardPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const dashboard = await loadAdminDashboard(client);
  const metrics = [
    { label: "Prodotti totali", value: dashboard.metrics.total, tone: "violet" },
    { label: "Pubblicati", value: dashboard.metrics.published, tone: "lime" },
    { label: "Bozze", value: dashboard.metrics.draft, tone: "neutral" },
    { label: "Archiviati", value: dashboard.metrics.archived, tone: "neutral" },
    { label: "Esauriti", value: dashboard.metrics.soldOut, tone: "danger" },
    { label: "Stock basso", value: dashboard.metrics.lowStock, tone: "warning" },
    { label: "Preordini", value: dashboard.metrics.preorder, tone: "violet" },
  ] as const;

  return (
    <div className={styles.dashboard}>
      <section className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Panoramica operativa</p>
          <h1>Catalogo e inventario</h1>
          <p>Stato reale del negozio, senza proiezioni o dati commerciali inventati.</p>
        </div>
      </section>

      <section aria-labelledby="metriche-title">
        <div className={styles.sectionTitle}>
          <h2 id="metriche-title">Stato catalogo</h2>
          <span>Aggiornato dalla banca dati</span>
        </div>
        <div className={styles.metricsGrid}>
          {metrics.map((metric) => (
            <article className={styles.metricCard} data-tone={metric.tone} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{numberFormat.format(metric.value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="azioni-title">
        <div className={styles.sectionTitle}>
          <h2 id="azioni-title">Azioni rapide</h2>
        </div>
        <div className={styles.quickGrid}>
          <Link href={{ pathname: "/admin/prodotti/nuovo" }}><PackagePlus aria-hidden="true" />Nuovo prodotto</Link>
          <Link href={{ pathname: "/admin/inventario" }}><RefreshCcw aria-hidden="true" />Aggiorna stock</Link>
          <Link href={{ pathname: "/admin/media" }}><ImagePlus aria-hidden="true" />Carica media</Link>
          <Link href="/"><ArrowUpRight aria-hidden="true" />Visualizza negozio</Link>
        </div>
      </section>

      <section className={styles.movementsPanel} aria-labelledby="movimenti-title">
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>Ultime variazioni</p>
            <h2 id="movimenti-title">Movimenti inventario</h2>
          </div>
          <Link href={{ pathname: "/admin/inventario" }}>Apri inventario</Link>
        </div>

        {dashboard.movements.length === 0 ? (
          <div className={styles.emptyMovements}>
            <Boxes aria-hidden="true" />
            <strong>Nessun movimento registrato</strong>
            <p>Le variazioni di stock compariranno qui quando saranno effettuate.</p>
          </div>
        ) : (
          <div className={styles.movementList} role="list">
            {dashboard.movements.map((movement) => (
              <article className={styles.movementRow} key={movement.id} role="listitem">
                <div>
                  <strong>{movement.productName}</strong>
                  <span className={styles.mono}>{movement.sku}</span>
                </div>
                <div>
                  <span>{movement.reason.replaceAll("_", " ")}</span>
                  <time dateTime={movement.createdAt}>{dateFormat.format(new Date(movement.createdAt))}</time>
                </div>
                <div className={styles.stockDelta} data-negative={movement.delta < 0 || undefined}>
                  <strong>{movement.delta > 0 ? "+" : ""}{movement.delta}</strong>
                  <span>Stock {movement.stockAfter}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
