import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Re-export dei tipi e delle funzioni pure dal package neutrale.
// Il test legacy (tests/unit/admin-dashboard.test.ts) continua a importare
// da "@/lib/admin/dashboard" e non deve essere modificato.
// ---------------------------------------------------------------------------
export type {
  DashboardMetrics,
  DashboardMovement,
  DashboardStaffActivity,
  DashboardCommerceData,
  DashboardData,
  OperationsDashboard,
} from "@geardrop/data-contract";

export {
  summarizeDashboardProducts,
  mapDashboardPayload,
  loadOperationsDashboard,
} from "@geardrop/data-contract";

// ---------------------------------------------------------------------------
// Adapter legacy: lancia un'eccezione in caso di "unavailable", mappa
// "empty" e "loaded" al tipo piatto DashboardData esistente.
// Comportamento invariato rispetto alla versione precedente.
// ---------------------------------------------------------------------------
import {
  loadOperationsDashboard as _loadOperationsDashboard,
} from "@geardrop/data-contract";
import type { DashboardData } from "@geardrop/data-contract";

export async function loadAdminDashboard(
  client: SupabaseClient<Database>,
  organizationId: number,
): Promise<DashboardData> {
  const result = await _loadOperationsDashboard(client as Parameters<typeof _loadOperationsDashboard>[0], organizationId);
  if (result.status === "unavailable") {
    throw new Error("Impossibile caricare i dati operativi della dashboard");
  }
  // Sia "loaded" sia "empty" contengono i dati reali; la UI legacy riceve
  // sempre il payload piatto, il discriminatore è solo per la UI management.
  return {
    metrics: result.metrics,
    activeCoupons: result.activeCoupons,
    activePromotions: result.activePromotions,
    commerce: result.commerce,
    movements: result.movements,
    staffActivity: result.staffActivity,
  };
}

// ---------------------------------------------------------------------------
// Funnel: specifico dell'admin legacy, rimane in questo modulo.
// Non fa parte della management overview.
// ---------------------------------------------------------------------------
export type FunnelRow = { readonly day: string; readonly event: string; readonly count: number };

/** Daily funnel event counts for the last `days` days. Returns empty array on error (manager permission). */
export async function loadFunnelStats(
  client: SupabaseClient<Database>,
  organizationId: number,
  days: 7 | 30,
): Promise<readonly FunnelRow[]> {
  const result = await client.rpc("read_funnel_stats", { p_organization_id: organizationId, p_days: days });
  if (result.error) return [];
  return (result.data ?? []).map((row) => ({
    day: String(row.day),
    event: String(row.event),
    count: typeof row.count === "number" ? row.count : 0,
  }));
}

const FUNNEL_EVENTS = ["product_view", "add_to_cart", "cart_view", "checkout_view", "checkout_submit"] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

const FUNNEL_LABELS: Record<string, string> = {
  product_view: "Visualizzazioni prodotto",
  add_to_cart: "Aggiunto al carrello",
  cart_view: "Visualizzazioni carrello",
  checkout_view: "Visualizzazioni checkout",
  checkout_submit: "Submit checkout",
};

export type FunnelStep = {
  readonly event: string;
  readonly label: string;
  readonly count: number;
  readonly conversionFromPrev: number | null;
};

/** Aggregates raw daily rows into a funnel summary (totals + step-to-step conversion rates). */
export function buildFunnelSummary(rows: readonly FunnelRow[]): readonly FunnelStep[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.event, (totals.get(row.event) ?? 0) + row.count);
  }
  return FUNNEL_EVENTS.map((event, index) => {
    const count = totals.get(event) ?? 0;
    const prevEvent = index > 0 ? FUNNEL_EVENTS[index - 1] : null;
    const prevCount = prevEvent ? (totals.get(prevEvent) ?? 0) : null;
    const conversionFromPrev =
      prevCount === null || prevCount === 0 ? null : Math.round((count / prevCount) * 100);
    return { event, label: FUNNEL_LABELS[event] ?? event, count, conversionFromPrev };
  });
}
