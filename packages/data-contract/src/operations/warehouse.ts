/**
 * Contratto neutrale per il riepilogo di magazzino.
 * Nessuna dipendenza da Next.js, @/ alias o componenti UI.
 * Usato da packages/data-contract/src/management/overview.ts
 * e come sorgente del re-export in src/lib/admin/warehouse-repository.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

// ---------------------------------------------------------------------------
// Tipi esportati
// ---------------------------------------------------------------------------

/**
 * Riepilogo di magazzino: costi, valorizzazione, completezza profitto.
 * Tutti i valori a zero per un'azienda appena costituita sono dati legittimi.
 * null (restituito da loadWarehouseSummary) indica un errore di lettura.
 */
export type WarehouseSummary = {
  readonly stockValueCents: number;
  readonly productsWithoutCost: number;
  readonly draftReceipts: number;
  readonly periodDays: number;
  readonly completeOrders: number;
  readonly incompleteOrders: number;
  readonly profitCents: number;
  readonly revenueNetCents: number;
};

// ---------------------------------------------------------------------------
// Helper interni
// ---------------------------------------------------------------------------

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

// ---------------------------------------------------------------------------
// Loader neutrale
// ---------------------------------------------------------------------------

/**
 * Carica il riepilogo di magazzino per l'organizzazione indicata.
 *
 * Restituisce null se il dato non è disponibile (errore RPC, risposta malformata).
 * null non deve mai essere interpretato come zero dalla UI: è uno stato distinto.
 */
export async function loadWarehouseSummary(
  client: SupabaseClient<Database>,
  organizationId: number,
  days = 30,
): Promise<WarehouseSummary | null> {
  try {
    const { data, error } = await client.rpc("get_warehouse_summary", {
      p_organization_id: organizationId,
      p_days: days,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const row = data as Record<string, unknown>;
    return {
      stockValueCents: integer(row.stock_value_cents),
      productsWithoutCost: integer(row.products_without_cost),
      draftReceipts: integer(row.draft_receipts),
      periodDays: integer(row.period_days),
      completeOrders: integer(row.complete_orders),
      incompleteOrders: integer(row.incomplete_orders),
      profitCents: integer(row.profit_cents),
      revenueNetCents: integer(row.revenue_net_cents),
    };
  } catch {
    return null;
  }
}
