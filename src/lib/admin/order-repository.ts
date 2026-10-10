import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "@/lib/auth/roles";
import { maskEmail, orderPiiVisibility, type AdminOrderQuery } from "@/lib/admin/orders";
import type { Database } from "@/lib/supabase/database.types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
type OrderNote = Database["public"]["Tables"]["order_notes"]["Row"];
type StatusEvent = Database["public"]["Tables"]["order_status_events"]["Row"];
type AuditEvent = Database["public"]["Tables"]["audit_events"]["Row"];

export type AdminOrderListPage = {
  readonly items: readonly OrderRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
};

export type AdminOrderDetail = {
  readonly order: OrderRow;
  readonly items: readonly OrderItem[];
  readonly notes: readonly OrderNote[];
  readonly statusEvents: readonly StatusEvent[];
  readonly auditEvents: readonly AuditEvent[];
  readonly piiVisible: boolean;
};

function escapePattern(value: string): string {
  return value.replace(/[,%_()]/g, (character) => `\\${character}`);
}

function exclusiveEnd(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function redactOrder(order: OrderRow, role: StaffRole): OrderRow {
  if (orderPiiVisibility(role).view) return order;
  return { ...order, email: maskEmail(order.email), phone: null, shipping_address_snapshot: {}, billing_address_snapshot: {} };
}

export async function listAdminOrders(client: SupabaseClient<Database>, organizationId: number, query: AdminOrderQuery, role: StaffRole): Promise<AdminOrderListPage> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  let builder = client.from("orders").select("*", { count: "exact" }).eq("organization_id", organizationId);
  if (query.q) { const pattern = `%${escapePattern(query.q)}%`; builder = builder.or(`order_number.ilike.${pattern},email.ilike.${pattern}`); }
  if (query.from) builder = builder.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) builder = builder.lt("created_at", exclusiveEnd(query.to));
  if (query.status !== "all") builder = builder.eq("status", query.status);
  if (query.payment !== "all") builder = builder.eq("payment_status", query.payment);
  if (query.shipping) builder = builder.eq("shipping_method_code", query.shipping);
  if (query.coupon) builder = builder.ilike("coupon_code", query.coupon);
  const result = await builder.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (result.error) throw new Error("Impossibile caricare gli ordini");
  const total = result.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  return { items: (result.data ?? []).map((order) => redactOrder(order, role)), total, page: Math.min(query.page, pageCount), pageSize: query.pageSize, pageCount };
}

export async function loadAdminOrderDetail(client: SupabaseClient<Database>, organizationId: number, id: number, role: StaffRole): Promise<AdminOrderDetail | null> {
  const [order, items, notes, statusEvents, auditEvents] = await Promise.all([
    // An order of another company is simply not found here, even for someone who runs both.
    client.from("orders").select("*").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    client.from("order_items").select("*").eq("order_id", id).eq("organization_id", organizationId).order("id"),
    client.from("order_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    client.from("order_status_events").select("*").eq("order_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }),
    client.from("audit_events").select("*").eq("organization_id", organizationId).eq("entity_type", "orders").eq("entity_id", String(id)).order("created_at", { ascending: false }).limit(200),
  ]);
  if (order.error || items.error || notes.error || statusEvents.error || auditEvents.error) throw new Error("Impossibile caricare il dettaglio ordine");
  if (!order.data) return null;
  return {
    order: redactOrder(order.data, role), items: items.data ?? [], notes: notes.data ?? [], statusEvents: statusEvents.data ?? [], auditEvents: auditEvents.data ?? [],
    piiVisible: orderPiiVisibility(role).view,
  };
}

export async function listAdminOrdersForCsv(client: SupabaseClient<Database>, organizationId: number, query: AdminOrderQuery) {
  let builder = client.from("orders").select("id,order_number,email,created_at,status,payment_status,shipping_method_code,coupon_code,subtotal_cents,discount_cents,shipping_cents,total_cents,currency,shipping_address_snapshot").eq("organization_id", organizationId);
  if (query.q) { const pattern = `%${escapePattern(query.q)}%`; builder = builder.or(`order_number.ilike.${pattern},email.ilike.${pattern}`); }
  if (query.from) builder = builder.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) builder = builder.lt("created_at", exclusiveEnd(query.to));
  if (query.status !== "all") builder = builder.eq("status", query.status);
  if (query.payment !== "all") builder = builder.eq("payment_status", query.payment);
  if (query.shipping) builder = builder.eq("shipping_method_code", query.shipping);
  if (query.coupon) builder = builder.ilike("coupon_code", query.coupon);
  const result = await builder.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5000);
  if (result.error) throw new Error("Impossibile esportare gli ordini");
  return result.data ?? [];
}

/** Fetches items for a set of order IDs (used by the CSV export to compute partner_owed_cents). */
export async function listOrderItemsByOrderIds(client: SupabaseClient<Database>, organizationId: number, orderIds: readonly number[]) {
  if (orderIds.length === 0) return [];
  const result = await client.from("order_items").select("order_id,sku_snapshot,product_name_snapshot,quantity,unit_price_cents").eq("organization_id", organizationId).in("order_id", [...orderIds]);
  if (result.error) throw new Error("Impossibile caricare le righe degli ordini");
  return result.data ?? [];
}

/** Paid orders that contain at least one consignment line, newest first, with items. */
export async function listPartnerOrders(client: SupabaseClient<Database>, organizationId: number, consignmentSlugs: readonly string[]) {
  if (consignmentSlugs.length === 0) return [];
  // Fetch items whose SKU is one of the partner's slugs.
  const itemsResult = await client.from("order_items").select("order_id,sku_snapshot,product_name_snapshot,quantity,unit_price_cents").eq("organization_id", organizationId).in("sku_snapshot", [...consignmentSlugs]);
  if (itemsResult.error) throw new Error("Impossibile caricare le righe partner");
  const items = itemsResult.data ?? [];
  if (items.length === 0) return [];
  const orderIds = [...new Set(items.map((item) => item.order_id))];
  // Fetch the orders themselves, paid only.
  const ordersResult = await client.from("orders").select("id,order_number,created_at,payment_status").eq("organization_id", organizationId).in("id", orderIds).eq("payment_status", "paid").order("created_at", { ascending: false }).order("id", { ascending: false });
  if (ordersResult.error) throw new Error("Impossibile caricare gli ordini partner");
  const orders = ordersResult.data ?? [];
  // Group items by order_id.
  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  return orders.map((order) => ({ order, items: itemsByOrder.get(order.id) ?? [] }));
}
