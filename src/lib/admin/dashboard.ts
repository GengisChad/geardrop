import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";import type { Database } from "@/lib/supabase/database.types";
type DashboardProduct=Pick<Database["public"]["Tables"]["products"]["Row"],"availability_override"|"low_stock_threshold"|"manage_stock"|"publication_status"|"stock_quantity"|"stock_status">;
export type DashboardMetrics={readonly total:number;readonly published:number;readonly draft:number;readonly archived:number;readonly soldOut:number;readonly lowStock:number;readonly preorder:number};
export type DashboardMovement={readonly id:number;readonly delta:number;readonly stockAfter:number;readonly reason:string;readonly note:string|null;readonly createdAt:string;readonly productName:string;readonly sku:string};
export type DashboardData={readonly metrics:DashboardMetrics;readonly activeCoupons:number;readonly activePromotions:number;readonly commerce:{readonly orderCount:number;readonly revenueCents:number;readonly averageOrderValueCents:number;readonly latestOrders:readonly{readonly id:number;readonly orderNumber:string;readonly status:string;readonly paymentStatus:string;readonly totalCents:number;readonly createdAt:string}[]}|null;readonly movements:readonly DashboardMovement[];readonly staffActivity:readonly{readonly id:number;readonly action:string;readonly entityType:string;readonly entityId:string;readonly createdAt:string;readonly actorName:string}[]|null};

export function summarizeDashboardProducts(products:readonly DashboardProduct[]):DashboardMetrics{return products.reduce<DashboardMetrics>((metrics,product)=>({total:metrics.total+1,published:metrics.published+Number(product.publication_status==="published"),draft:metrics.draft+Number(product.publication_status==="draft"),archived:metrics.archived+Number(product.publication_status==="archived"),soldOut:metrics.soldOut+Number(product.manage_stock&&product.stock_status==="esaurito"&&product.publication_status!=="archived"),lowStock:metrics.lowStock+Number(product.manage_stock&&product.stock_quantity>0&&product.stock_quantity<=product.low_stock_threshold&&product.publication_status!=="archived"),preorder:metrics.preorder+Number(product.availability_override==="preorder")}),{total:0,published:0,draft:0,archived:0,soldOut:0,lowStock:0,preorder:0});}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}function integer(value:unknown):number{return typeof value==="number"&&Number.isSafeInteger(value)?value:0;}function text(value:unknown):string{return typeof value==="string"?value:"";}function rows(value:unknown):readonly unknown[]{return Array.isArray(value)?value:[];}
export function mapDashboardPayload(value:unknown):DashboardData{const root=record(value);const products=record(root.products);const commerceValue=root.commerce===null?null:record(root.commerce);return{metrics:{total:integer(products.total),published:integer(products.published),draft:integer(products.draft),archived:integer(products.archived),soldOut:integer(products.sold_out),lowStock:integer(products.low_stock),preorder:integer(products.preorder)},activeCoupons:integer(root.active_coupons),activePromotions:integer(root.active_promotions),commerce:commerceValue===null?null:{orderCount:integer(commerceValue.order_count),revenueCents:integer(commerceValue.revenue_cents),averageOrderValueCents:integer(commerceValue.average_order_value_cents),latestOrders:rows(commerceValue.latest_orders).map(item=>{const row=record(item);return{id:integer(row.id),orderNumber:text(row.order_number),status:text(row.status),paymentStatus:text(row.payment_status),totalCents:integer(row.total_cents),createdAt:text(row.created_at)}})},movements:rows(root.stock_movements).map(item=>{const row=record(item);return{id:integer(row.id),delta:integer(row.delta),stockAfter:integer(row.stock_after),reason:text(row.reason),note:typeof row.note==="string"?row.note:null,createdAt:text(row.created_at),productName:text(row.product_name)||"Prodotto non disponibile",sku:text(row.sku)||"—"}}),staffActivity:root.staff_activity===null?null:rows(root.staff_activity).map(item=>{const row=record(item);return{id:integer(row.id),action:text(row.action),entityType:text(row.entity_type),entityId:text(row.entity_id),createdAt:text(row.created_at),actorName:text(row.actor_name)||"Sistema"}})}};
export async function loadAdminDashboard(client:SupabaseClient<Database>):Promise<DashboardData>{const result=await client.rpc("get_admin_dashboard_metrics");if(result.error)throw new Error("Impossibile caricare i dati operativi della dashboard");return mapDashboardPayload(result.data);}

export type FunnelRow = { readonly day: string; readonly event: string; readonly count: number };

/** Daily funnel event counts for the last `days` days. Returns empty array on error (manager permission). */
export async function loadFunnelStats(client: SupabaseClient<Database>, days: 7 | 30): Promise<readonly FunnelRow[]> {
  const result = await client.rpc("read_funnel_stats", { p_days: days });
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
