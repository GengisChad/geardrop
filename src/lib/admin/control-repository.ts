import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ControlOrder } from "@/lib/admin/control";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id,order_number,email,status,payment_status,total_cents,refunded_cents,created_at,shipped_at,delivered_at,owner_notified_at,shipping_notified_at,delivery_notified_at,refund_prepared_at,refund_amount_cents,tracking_code,shipping_address_snapshot";

/** The company's orders, newest first (the shop's whole history fits: a few thousand at most). */
export async function loadControlOrders(client: Client, organizationId: number, limit = 3000): Promise<readonly ControlOrder[]> {
  const { data, error } = await client
    .from("orders")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Impossibile caricare gli ordini");
  return (data ?? []).map((order) => {
    const snapshot = order.shipping_address_snapshot;
    const name =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && typeof snapshot["name"] === "string" && snapshot["name"].trim()
        ? snapshot["name"].trim()
        : null;
    return {
      id: order.id,
      orderNumber: order.order_number,
      email: order.email,
      name,
      status: order.status,
      paymentStatus: order.payment_status,
      totalCents: order.total_cents,
      refundedCents: order.refunded_cents,
      createdAt: order.created_at,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      ownerNotifiedAt: order.owner_notified_at,
      shippingNotifiedAt: order.shipping_notified_at,
      deliveryNotifiedAt: order.delivery_notified_at,
      refundPreparedAt: order.refund_prepared_at,
      refundAmountCents: order.refund_amount_cents,
      trackingCode: order.tracking_code,
    };
  });
}
