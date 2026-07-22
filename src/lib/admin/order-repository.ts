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

export async function listAdminOrders(client: SupabaseClient<Database>, query: AdminOrderQuery, role: StaffRole): Promise<AdminOrderListPage> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  let builder = client.from("orders").select("*", { count: "exact" });
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

export async function loadAdminOrderDetail(client: SupabaseClient<Database>, id: number, role: StaffRole): Promise<AdminOrderDetail | null> {
  const [order, items, notes, statusEvents, auditEvents] = await Promise.all([
    client.from("orders").select("*").eq("id", id).maybeSingle(),
    client.from("order_items").select("*").eq("order_id", id).order("id"),
    client.from("order_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    client.from("order_status_events").select("*").eq("order_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }),
    client.from("audit_events").select("*").eq("entity_type", "orders").eq("entity_id", String(id)).order("created_at", { ascending: false }).limit(200),
  ]);
  if (order.error || items.error || notes.error || statusEvents.error || auditEvents.error) throw new Error("Impossibile caricare il dettaglio ordine");
  if (!order.data) return null;
  return {
    order: redactOrder(order.data, role), items: items.data ?? [], notes: notes.data ?? [], statusEvents: statusEvents.data ?? [], auditEvents: auditEvents.data ?? [],
    piiVisible: orderPiiVisibility(role).view,
  };
}

export async function listAdminOrdersForCsv(client: SupabaseClient<Database>, query: AdminOrderQuery) {
  let builder = client.from("orders").select("order_number,email,created_at,status,payment_status,shipping_method_code,coupon_code,subtotal_cents,discount_cents,shipping_cents,total_cents,currency");
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
