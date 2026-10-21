/**
 * Contratto neutrale per i dati operativi della dashboard.
 * Nessuna dipendenza da Next.js, @/ alias, cookie o componenti UI.
 * Usato sia da packages/data-contract/src/management/overview.ts
 * sia come sorgente del re-export legacy src/lib/admin/dashboard.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

// ---------------------------------------------------------------------------
// Tipi derivati dallo schema (non ridefiniti a mano)
// ---------------------------------------------------------------------------

type DashboardProduct = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "availability_override" | "low_stock_threshold" | "manage_stock" | "publication_status" | "stock_quantity" | "stock_status"
>;

// ---------------------------------------------------------------------------
// Tipi esportati
// ---------------------------------------------------------------------------

export type DashboardMetrics = {
  readonly total: number;
  readonly published: number;
  readonly draft: number;
  readonly archived: number;
  readonly soldOut: number;
  readonly lowStock: number;
  readonly preorder: number;
};

export type DashboardMovement = {
  readonly id: number;
  readonly delta: number;
  readonly stockAfter: number;
  readonly reason: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly productName: string;
  readonly sku: string;
};

export type DashboardStaffActivity = {
  readonly id: number;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly createdAt: string;
  readonly actorName: string;
};

export type DashboardCommerceData = {
  readonly orderCount: number;
  readonly revenueCents: number;
  readonly grossRevenueCents: number;
  readonly refundedCents: number;
  readonly refundedOrderCount: number;
  readonly unpaidOrderCount: number;
  readonly averageOrderValueCents: number;
  readonly latestOrders: readonly {
    readonly id: number;
    readonly orderNumber: string;
    readonly status: string;
    readonly paymentStatus: string;
    readonly totalCents: number;
    readonly createdAt: string;
  }[];
};

/**
 * Struttura piatta dei dati dashboard: usata per la retrocompatibilità
 * con l'admin legacy (src/lib/admin/dashboard.ts) e come payload
 * dello stato "loaded" e "empty" dell'OperationsDashboard.
 */
export type DashboardData = {
  readonly metrics: DashboardMetrics;
  readonly activeCoupons: number;
  readonly activePromotions: number;
  readonly commerce: DashboardCommerceData | null;
  readonly movements: readonly DashboardMovement[];
  readonly staffActivity: readonly DashboardStaffActivity[] | null;
};

/**
 * Unione discriminata per la superficie management.
 *
 * - "loaded": dati reali letti con successo (metrics.total > 0 o commerce.orderCount > 0)
 * - "empty": dati letti correttamente, ma l'azienda ha zero prodotti e zero ordini
 *            (stato legittimo per Oryvenne al momento del primo accesso)
 * - "unavailable": errore di lettura — la UI deve mostrare "non disponibile", MAI zero
 *
 * Il campo di stato discriminato impedisce alla UI di confondere "nessun dato"
 * con "errore non comunicato".
 */
export type OperationsDashboard =
  | (DashboardData & { readonly status: "loaded" })
  | (DashboardData & { readonly status: "empty" })
  | { readonly status: "unavailable" };

// ---------------------------------------------------------------------------
// Helper interni di parsing (non esportati)
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rows(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

// ---------------------------------------------------------------------------
// Funzioni pure esportate (usate anche dai test legacy)
// ---------------------------------------------------------------------------

/**
 * Aggrega una lista di righe prodotto nelle metriche della dashboard.
 * Identico al comportamento già testato in tests/unit/admin-dashboard.test.ts.
 */
export function summarizeDashboardProducts(products: readonly DashboardProduct[]): DashboardMetrics {
  return products.reduce<DashboardMetrics>(
    (metrics, product) => ({
      total: metrics.total + 1,
      published: metrics.published + Number(product.publication_status === "published"),
      draft: metrics.draft + Number(product.publication_status === "draft"),
      archived: metrics.archived + Number(product.publication_status === "archived"),
      soldOut:
        metrics.soldOut +
        Number(
          product.manage_stock &&
            product.stock_status === "esaurito" &&
            product.publication_status !== "archived",
        ),
      lowStock:
        metrics.lowStock +
        Number(
          product.manage_stock &&
            product.stock_quantity > 0 &&
            product.stock_quantity <= product.low_stock_threshold &&
            product.publication_status !== "archived",
        ),
      preorder: metrics.preorder + Number(product.availability_override === "preorder"),
    }),
    { total: 0, published: 0, draft: 0, archived: 0, soldOut: 0, lowStock: 0, preorder: 0 },
  );
}

/**
 * Mappa il payload grezzo dell'RPC get_admin_dashboard_metrics nella struttura DashboardData.
 * Semantica ricavo:
 * - revenueCents: ricavo netto (lordo meno rimborsi), usato nelle card revenue
 * - grossRevenueCents: ricavo lordo (ordini incassati prima dei rimborsi)
 * - refundedCents: totale rimborsato
 * - refundedOrderCount: ordini con almeno un rimborso
 * - unpaidOrderCount: ordini in attesa di pagamento (separati)
 */
export function mapDashboardPayload(value: unknown): DashboardData {
  const root = record(value);
  const products = record(root.products);
  const commerceValue = root.commerce === null ? null : record(root.commerce);

  return {
    metrics: {
      total: integer(products.total),
      published: integer(products.published),
      draft: integer(products.draft),
      archived: integer(products.archived),
      soldOut: integer(products.sold_out),
      lowStock: integer(products.low_stock),
      preorder: integer(products.preorder),
    },
    activeCoupons: integer(root.active_coupons),
    activePromotions: integer(root.active_promotions),
    commerce:
      commerceValue === null
        ? null
        : {
            orderCount: integer(commerceValue.order_count),
            revenueCents: integer(commerceValue.revenue_cents),
            grossRevenueCents: integer(commerceValue.gross_revenue_cents),
            refundedCents: integer(commerceValue.refunded_cents),
            refundedOrderCount: integer(commerceValue.refunded_order_count),
            unpaidOrderCount: integer(commerceValue.unpaid_order_count),
            averageOrderValueCents: integer(commerceValue.average_order_value_cents),
            latestOrders: rows(commerceValue.latest_orders).map((item) => {
              const row = record(item);
              return {
                id: integer(row.id),
                orderNumber: text(row.order_number),
                status: text(row.status),
                paymentStatus: text(row.payment_status),
                totalCents: integer(row.total_cents),
                createdAt: text(row.created_at),
              };
            }),
          },
    movements: rows(root.stock_movements).map((item) => {
      const row = record(item);
      return {
        id: integer(row.id),
        delta: integer(row.delta),
        stockAfter: integer(row.stock_after),
        reason: text(row.reason),
        note: typeof row.note === "string" ? row.note : null,
        createdAt: text(row.created_at),
        productName: text(row.product_name) || "Prodotto non disponibile",
        sku: text(row.sku) || "—",
      };
    }),
    staffActivity:
      root.staff_activity === null
        ? null
        : rows(root.staff_activity).map((item) => {
            const row = record(item);
            return {
              id: integer(row.id),
              action: text(row.action),
              entityType: text(row.entity_type),
              entityId: text(row.entity_id),
              createdAt: text(row.created_at),
              actorName: text(row.actor_name) || "Sistema",
            };
          }),
  };
}

// ---------------------------------------------------------------------------
// Loader neutrale con stato discriminato
// ---------------------------------------------------------------------------

/**
 * Carica i dati operativi della dashboard per l'organizzazione indicata.
 *
 * Errore RPC → { status: "unavailable" } — MAI metriche a zero.
 * Zero prodotti e zero ordini → { status: "empty", ...zeriVeri } — azienda vuota legittima.
 * Dati presenti → { status: "loaded", ...data }.
 */
export async function loadOperationsDashboard(
  client: SupabaseClient<Database>,
  organizationId: number,
): Promise<OperationsDashboard> {
  try {
    const result = await client.rpc("get_admin_dashboard_metrics", {
      p_organization_id: organizationId,
    });
    if (result.error) return { status: "unavailable" };
    const data = mapDashboardPayload(result.data);
    const isEmpty =
      data.metrics.total === 0 &&
      (data.commerce === null || data.commerce.orderCount === 0);
    return isEmpty ? { status: "empty", ...data } : { status: "loaded", ...data };
  } catch {
    return { status: "unavailable" };
  }
}
