import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/control/control.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { EMAIL_CHECK_DAYS, fulfilmentKpis, orderAnomalies } from "@/lib/admin/control";
import { loadControlOrders } from "@/lib/admin/control-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });

function hoursText(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${decimal.format(hours)} h` : `${decimal.format(hours / 24)} g`;
}

/**
 * "Controllo" (owner, 2026-11-18): how fast orders leave and arrive over the last 30 days, and
 * the list of what went wrong on the way, read from the orders themselves.
 */
export default async function ControlPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const orders = await loadControlOrders(client, principal.organization.id);
  const now = new Date();
  const kpis = fulfilmentKpis(orders, now);
  const anomalies = orderAnomalies(orders, now);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Ordini / Controllo</p>
          <h1>Controllo</h1>
          <span>Ultimi 30 giorni · {kpis.paidOrders} ordini pagati</span>
        </div>
      </header>

      <section aria-label="Tempi di evasione" className={styles.metrics}>
        <article className={styles.metric} data-tone={kpis.medianHoursToShip !== null && kpis.medianHoursToShip <= 48 ? "good" : undefined}>
          <span>Dall&rsquo;ordine alla spedizione</span>
          <strong data-testid="kpi-ship">{hoursText(kpis.medianHoursToShip)}</strong>
          <small>mediana su {kpis.shippedOrders} spediti</small>
        </article>
        <article className={styles.metric}>
          <span>Spediti entro 48 ore</span>
          <strong>{kpis.shippedWithin48h === null ? "—" : percent.format(kpis.shippedWithin48h)}</strong>
          <small>degli ordini spediti</small>
        </article>
        <article className={styles.metric}>
          <span>Dalla spedizione alla consegna</span>
          <strong>{kpis.medianDaysToDeliver === null ? "—" : `${decimal.format(kpis.medianDaysToDeliver)} g`}</strong>
          <small>mediana sui consegnati</small>
        </article>
        <article className={styles.metric} data-tone={kpis.waiting > 0 ? "warning" : "good"}>
          <span>Da spedire adesso</span>
          <strong>{kpis.waiting}</strong>
          <small>{kpis.oldestWaitingHours === null ? "nessuno in attesa" : `il più vecchio da ${hoursText(kpis.oldestWaitingHours)}`}</small>
        </article>
      </section>

      <section aria-labelledby="anomalies-title" className={styles.panel}>
        <h2 id="anomalies-title">Da controllare · {anomalies.length}</h2>
        <p>
          Email non partite (ordini degli ultimi {EMAIL_CHECK_DAYS} giorni), ordini pagati fermi da più di 3 giorni, pacchi in viaggio da
          più di 10, rimborsi a metà, pagamenti mai incassati. L&rsquo;errore tecnico preciso resta nei log di Vercel; qui c&rsquo;è
          l&rsquo;ordine da sistemare.
        </p>
        {anomalies.length === 0 ? (
          <p className={styles.ok}>Tutto in ordine.</p>
        ) : (
          <ul className={styles.list}>
            {anomalies.map((anomaly) => (
              <li data-kind={anomaly.kind} data-testid="anomaly" key={`${anomaly.kind}-${anomaly.orderId}`}>
                <span>
                  <Link href={`/admin/ordini/${anomaly.orderId}`}>{anomaly.orderNumber}</Link> · {anomaly.message}
                </span>
                <time dateTime={anomaly.since}>{dateTime.format(new Date(anomaly.since))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
