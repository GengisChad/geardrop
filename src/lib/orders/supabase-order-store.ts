import "server-only";

import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import type { LowStockProduct, OrderStore, StoredOrder } from "./process-paid-checkout";
import type { PaidCheckout } from "./stripe-order";

/** The order lines as the database function reads them; a bundle carries the packs it ships. */
export function stripeOrderLines(checkout: PaidCheckout) {
  return checkout.lines.map((line) => ({
    slug: line.slug,
    name: line.name,
    quantity: line.quantity,
    unit_price_cents: line.unitPriceCents,
    ...(line.components ? { components: line.components.map((part) => ({ slug: part.slug, quantity: part.quantity })) } : {}),
  }));
}

/**
 * Order storage for the Stripe webhook. It runs with the secret key because no shopper is
 * signed in when Stripe calls; the database function is granted to that key alone.
 */
export function createSupabaseOrderStore(client = createPrivilegedSupabaseClient()): OrderStore {
  return {
    async record(checkout: PaidCheckout): Promise<StoredOrder> {
      const result = await client.rpc("record_stripe_checkout_order", {
        p_session_id: checkout.sessionId,
        p_payment_intent_id: checkout.paymentIntentId ?? "",
        p_order_number: checkout.reference,
        p_email: checkout.email,
        p_phone: checkout.phone ?? "",
        p_shipping_address: { ...checkout.shipping, phone: checkout.phone ?? "" },
        p_lines: stripeOrderLines(checkout),
        p_shipping_cents: checkout.shippingCents,
        p_notes: checkout.notes ?? "",
        p_discount_cents: checkout.discountCents,
        p_coupon_code: checkout.couponCode ?? "",
      });
      const row = result.data?.[0];
      if (result.error || !row) throw new Error(`record_stripe_checkout_order: ${result.error?.message ?? "no row"}`);
      // One order line per checkout line, written in the same order. The order is already safe,
      // so an unreadable split only costs the email its pre-order flags, never the notification.
      const items = await client.from("order_items").select("preorder_quantity").eq("order_id", row.order_id).order("id");
      if (items.error) {
        console.error("[orders] pre-order split not readable:", items.error.message);
        return { id: row.order_id, orderNumber: row.order_number, created: row.created };
      }
      return {
        id: row.order_id,
        orderNumber: row.order_number,
        created: row.created,
        preorderQuantities: items.data.map((item) => item.preorder_quantity),
      };
    },

    async ownerNotified(orderId: number): Promise<boolean> {
      const result = await client.from("orders").select("owner_notified_at").eq("id", orderId).single();
      if (result.error) throw new Error(`orders.owner_notified_at: ${result.error.message}`);
      return result.data.owner_notified_at !== null;
    },

    async markOwnerNotified(orderId: number): Promise<void> {
      const result = await client.from("orders").update({ owner_notified_at: new Date().toISOString() }).eq("id", orderId);
      if (result.error) throw new Error(`orders.owner_notified_at: ${result.error.message}`);
    },

    async lowStock(orderId: number): Promise<readonly LowStockProduct[]> {
      // Collect product ids touched by this order: regular lines and bundle components.
      const [items, movements] = await Promise.all([
        client.from("order_items").select("product_id").eq("order_id", orderId).not("product_id", "is", null),
        client.from("inventory_movements").select("product_id").eq("order_id", orderId),
      ]);
      if (items.error) throw new Error(`order_items: ${items.error.message}`);
      if (movements.error) throw new Error(`inventory_movements: ${movements.error.message}`);

      const productIds = new Set<number>();
      for (const item of items.data) if (item.product_id != null) productIds.add(item.product_id);
      for (const mov of movements.data) productIds.add(mov.product_id);
      if (productIds.size === 0) return [];

      const { data, error } = await client
        .from("products")
        .select("slug, name, stock_quantity, stock_status, low_stock_threshold")
        .in("id", [...productIds]);
      if (error) throw new Error(`products low_stock: ${error.message}`);

      return (data ?? [])
        .filter((p) => p.stock_quantity <= p.low_stock_threshold)
        .sort((a, b) => a.stock_quantity - b.stock_quantity || a.name.localeCompare(b.name))
        .map((p) => ({
          name: p.name,
          slug: p.slug,
          stockQuantity: p.stock_quantity,
          stockStatus: p.stock_status as string,
        }));
    },
  };
}
