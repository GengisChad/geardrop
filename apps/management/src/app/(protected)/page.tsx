import Link from "next/link";
import { cookies } from "next/headers";
import { createManagementServerClient } from "@/lib/supabase/server";
import {
  requireManagementPrincipal,
  StaffAuthorizationError,
} from "@/lib/management/access";
import {
  MANAGEMENT_ORGANIZATION_COOKIE,
  loadManagementOverview,
} from "@geardrop/data-contract";
import type {
  OperationsDashboard,
  WarehouseSummary,
  DashboardMovement,
} from "@geardrop/data-contract";
import styles from "@/app/management.module.css";

// Dati reali: nessuna cache, nessun dato autenticato in service worker.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// ---------------------------------------------------------------------------
// Helpers di formattazione (solo UI, nessun calcolo di business)
// ---------------------------------------------------------------------------

function eur(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function dateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Blocchi UI discriminati per stato
// ---------------------------------------------------------------------------

function DashboardUnavailable() {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Prodotti e stock</p>
      <span className={`${styles.statusBadge} ${styles.statusUnavailable}`}>
        Dati non disponibili
      </span>
      <p style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.75rem" }}>
        Impossibile leggere i dati operativi in questo momento. Riprova tra
        poco.
      </p>
    </div>
  );
}

// read_access spento è una scelta, non un guasto: lo si dice come tale e si indica dove cambiarlo.
function DashboardReadOff({ organizationName }: { organizationName: string }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Prodotti e stock</p>
      <span className={`${styles.statusBadge} ${styles.statusEmpty}`}>
        Lettura non attiva
      </span>
      <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.75rem" }}>
        La lettura dei dati operativi di {organizationName} è spenta. Un owner
        con autenticazione a due fattori può attivarla in{" "}
        <Link href="/settings/security">Sicurezza</Link>.
      </p>
    </div>
  );
}

function DashboardEmpty() {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Prodotti e stock</p>
      <span className={`${styles.statusBadge} ${styles.statusEmpty}`}>
        Nessun prodotto ancora
      </span>
      <p style={{ fontSize: "0.8rem", color: "#555", marginTop: "0.75rem" }}>
        Questa azienda non ha ancora prodotti nel catalogo.
      </p>
    </div>
  );
}

function DashboardLoaded({
  dashboard,
}: {
  dashboard: OperationsDashboard & { status: "loaded" | "empty" };
}) {
  const { metrics } = dashboard;

  return (
    <>
      {/* Metriche prodotto */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Prodotti e stock</p>
        <div className={styles.metricsGrid}>
          <div className={styles.metricCell}>
            <p className={styles.metricValue}>{metrics.total}</p>
            <p className={styles.metricLabel}>Totale</p>
          </div>
          <div className={styles.metricCell}>
            <p className={styles.metricValue}>{metrics.published}</p>
            <p className={styles.metricLabel}>Pubblicati</p>
          </div>
          <div className={styles.metricCell}>
            <p className={styles.metricValue}>{metrics.draft}</p>
            <p className={styles.metricLabel}>Bozza</p>
          </div>
          <div className={`${styles.metricCell} ${metrics.soldOut > 0 ? styles.metricWarn : ""}`}>
            <p className={styles.metricValue}>{metrics.soldOut}</p>
            <p className={styles.metricLabel}>Esauriti</p>
          </div>
          <div className={`${styles.metricCell} ${metrics.lowStock > 0 ? styles.metricWarn : ""}`}>
            <p className={styles.metricValue}>{metrics.lowStock}</p>
            <p className={styles.metricLabel}>Stock basso</p>
          </div>
          <div className={styles.metricCell}>
            <p className={styles.metricValue}>{metrics.preorder}</p>
            <p className={styles.metricLabel}>Preordine</p>
          </div>
        </div>
      </div>

      {/* Aggregati ordini */}
      {dashboard.commerce ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Ordini (ultimi 30 giorni)</p>
          <div className={styles.commerceRow}>
            <div className={styles.commerceStat}>
              <span className={styles.commerceStatValue}>
                {dashboard.commerce.orderCount}
              </span>
              <span className={styles.commerceStatLabel}>Ordini</span>
            </div>
            <div className={styles.commerceStat}>
              <span className={styles.commerceStatValue}>
                {eur(dashboard.commerce.revenueCents)}
              </span>
              <span className={styles.commerceStatLabel}>Ricavo netto</span>
            </div>
            <div className={styles.commerceStat}>
              <span className={styles.commerceStatValue}>
                {dashboard.commerce.unpaidOrderCount}
              </span>
              <span className={styles.commerceStatLabel}>Non pagati</span>
            </div>
            <div className={styles.commerceStat}>
              <span className={styles.commerceStatValue}>
                {dashboard.commerce.refundedOrderCount}
              </span>
              <span className={styles.commerceStatLabel}>Rimborsati</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MovementsSection({
  movements,
}: {
  movements: readonly DashboardMovement[];
}) {
  if (movements.length === 0) return null;

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Movimenti recenti</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Prodotto</th>
            <th>SKU</th>
            <th>Delta</th>
            <th>Stock</th>
            <th>Motivo</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td>{m.productName}</td>
              <td>{m.sku}</td>
              <td
                className={
                  m.delta > 0 ? styles.positive : m.delta < 0 ? styles.negative : undefined
                }
              >
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </td>
              <td>{m.stockAfter}</td>
              <td>{m.reason}</td>
              <td>{dateShort(m.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarehouseSection({
  warehouse,
}: {
  warehouse: WarehouseSummary | null;
}) {
  if (warehouse === null) {
    // null = errore di lettura, non azienda vuota — non confondere i due stati
    return (
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Magazzino</p>
        <span className={`${styles.statusBadge} ${styles.statusUnavailable}`}>
          Non disponibile
        </span>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Magazzino (ultimi {warehouse.periodDays} giorni)</p>
      <div className={styles.warehouseRow}>
        <div className={styles.warehouseStat}>
          <span className={styles.warehouseStatValue}>
            {eur(warehouse.stockValueCents)}
          </span>
          <span className={styles.warehouseStatLabel}>Valore stock</span>
        </div>
        <div className={styles.warehouseStat}>
          <span className={styles.warehouseStatValue}>
            {eur(warehouse.profitCents)}
          </span>
          <span className={styles.warehouseStatLabel}>Profitto periodo</span>
        </div>
        <div className={styles.warehouseStat}>
          <span className={styles.warehouseStatValue}>
            {warehouse.productsWithoutCost}
          </span>
          <span className={styles.warehouseStatLabel}>Senza costo</span>
        </div>
        <div className={styles.warehouseStat}>
          <span className={styles.warehouseStatValue}>
            {warehouse.draftReceipts}
          </span>
          <span className={styles.warehouseStatLabel}>Ricevute bozza</span>
        </div>
      </div>
    </div>
  );
}

const DISABLED_MODULES = [
  {
    name: "Acquisti",
    hint: "Fornitori, ordini di acquisto e ricezioni merci.",
  },
  {
    name: "Fulfillment",
    hint: "Picking, spedizioni, etichette e tracking.",
  },
  {
    name: "Forecast",
    hint: "Copertura, rotazione e previsione riordino.",
  },
  {
    name: "Prezzi",
    hint: "Osservazioni di mercato, proposte e decisioni.",
  },
  {
    name: "Marketing",
    hint: "Segmenti, campagne e risultati.",
  },
] as const;

// ---------------------------------------------------------------------------
// Pagina
// ---------------------------------------------------------------------------

export default async function OverviewPage() {
  const client = await createManagementServerClient();

  // Il cookie è solo una preferenza: verrà validato da requireManagementPrincipal
  // contro le membership attive nel database.
  const cookieStore = await cookies();
  const preferredSlug = cookieStore.get(MANAGEMENT_ORGANIZATION_COOKIE)?.value;

  let principal;
  try {
    principal = await requireManagementPrincipal(client, preferredSlug);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      // Il layout ha già eseguito il controllo: arrivare qui significa che
      // la sessione è scaduta nel tempo tra layout e page render.
      // Nessun redirect a /login dalla page: lasciamo che il Next.js
      // router revalidi e il layout gestisca il redirect.
      throw error;
    }
    throw error;
  }

  const overview = await loadManagementOverview(client, principal);
  const { readAccess, dashboard, warehouse } = overview;

  return (
    <main className={styles.overview}>
      {/* Intestazione */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Panoramica</h1>
        <p className={styles.pageSubtitle}>
          {principal.organization.name} · {principal.role}
        </p>
      </div>

      {/* Dati operativi discriminati per stato */}
      {readAccess === "off" ? (
        <DashboardReadOff organizationName={principal.organization.name} />
      ) : dashboard.status === "unavailable" ? (
        <DashboardUnavailable />
      ) : dashboard.status === "empty" ? (
        <>
          <DashboardEmpty />
          <WarehouseSection warehouse={warehouse} />
        </>
      ) : (
        <>
          <DashboardLoaded dashboard={dashboard} />
          <MovementsSection movements={dashboard.movements} />
          <WarehouseSection warehouse={warehouse} />
        </>
      )}

      {/* Moduli non ancora abilitati — senza link o azioni mutanti */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Non ancora abilitati</p>
        <div className={styles.modulesGrid}>
          {DISABLED_MODULES.map((mod) => (
            <div key={mod.name} className={styles.moduleCard}>
              <p className={styles.moduleCardName}>{mod.name}</p>
              <p className={styles.moduleCardHint}>{mod.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
