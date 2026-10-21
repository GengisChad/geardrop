/**
 * Orchestratore read-only della management overview.
 * Nessuna dipendenza da Next.js, cookie, @/ alias o componenti UI.
 *
 * Ordine fisso imposto dal piano:
 *   1. management_api.list_management_features  (fail-closed)
 *   2. require read_access                      (fail-closed)
 *   3. query sull'azienda corrente (principal.organization.id):
 *      – loadOperationsDashboard
 *      – loadWarehouseSummary
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { loadManagementFeatures, requireManagementFeature } from "./features";
import type { StaffPrincipal } from "../auth/staff-principal";
import { loadOperationsDashboard } from "../operations/dashboard";
import { loadWarehouseSummary } from "../operations/warehouse";
import type { OperationsDashboard } from "../operations/dashboard";
import type { WarehouseSummary } from "../operations/warehouse";

// ---------------------------------------------------------------------------
// Tipo pubblico
// ---------------------------------------------------------------------------

/**
 * Stato di read_access per l'azienda corrente:
 * – "on": acceso, i loader di business sono partiti;
 * – "off": spento per scelta, nessun loader è partito (la UI dice "lettura non attiva");
 * – "unknown": flag illeggibile, nessun loader è partito (la UI dice "non disponibile").
 */
export type ManagementReadAccess = "on" | "off" | "unknown";

export type ManagementOverview = Readonly<{
  readAccess: ManagementReadAccess;
  dashboard: OperationsDashboard;
  warehouse: WarehouseSummary | null;
}>;

// ---------------------------------------------------------------------------
// Loader orchestratore
// ---------------------------------------------------------------------------

/**
 * Carica la panoramica gestionale in sola lettura.
 *
 * Sicurezza:
 * - organizzazione, ruolo e membership vengono da StaffPrincipal (già verificato server-side),
 *   mai da form, cookie non validati o componenti client;
 * - se read_access è spento, assente o illeggibile, NESSUN loader di business parte;
 * - un errore di lettura diventa stato "unavailable", mai metriche a zero.
 */
export async function loadManagementOverview(
  client: SupabaseClient<Database>,
  principal: StaffPrincipal,
): Promise<ManagementOverview> {
  const closed = (readAccess: "off" | "unknown"): ManagementOverview => ({
    readAccess,
    dashboard: { status: "unavailable" },
    warehouse: null,
  });

  // Step 1: feature flags (fail-closed)
  let features: Awaited<ReturnType<typeof loadManagementFeatures>>;
  try {
    features = await loadManagementFeatures(client, principal.organization.id);
  } catch {
    return closed("unknown");
  }

  // Step 2: read_access obbligatorio (fail-closed)
  try {
    requireManagementFeature(features, "read_access");
  } catch {
    return closed("off");
  }

  // Step 3: query sull'azienda corrente — ID sempre da principal, mai forgiabile
  const orgId = principal.organization.id;

  const [dashboard, warehouse] = await Promise.all([
    loadOperationsDashboard(client, orgId),
    loadWarehouseSummary(client, orgId),
  ]);

  return { readAccess: "on", dashboard, warehouse };
}
