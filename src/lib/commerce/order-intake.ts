import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import type { Money } from "./types";

export type PlacedOrder = {
  readonly orderNumber: string;
  /**
   * The authoritative total, when the buyer is allowed to read their own order back.
   * Guests cannot — RLS binds order rows to `customer_id` — so this stays null rather
   * than showing a number the server has not confirmed.
   */
  readonly total: Money | null;
};

/**
 * Mirrors `'GD-' || lpad(id::text, 8, '0')` from the order intake migration. Only used
 * for guests, who cannot select their own row back; `orderNumberFormat` in the unit
 * tests pins this against the SQL so the two cannot drift apart silently.
 */
export function formatOrderNumber(orderId: number): string {
  return `GD-${String(orderId).padStart(8, "0")}`;
}

/**
 * Places an order through the transactional `create_order` RPC.
 *
 * The client passed in must be the request-scoped one built from the request cookies:
 * that is what gives PostgreSQL an `auth.uid()` to bind the order to. A service-role
 * client would authenticate as nobody and silently file every order as a guest order.
 */
export async function placeOrder(
  client: SupabaseClient<Database>,
  input: PlaceOrderInput,
): Promise<PlacedOrder> {
  const slugs = input.lines.map((line) => line.slug);
  const { data: products, error: productError } = await client
    .from("products")
    .select("id,slug")
    .in("slug", slugs);
  if (productError) throw productError;

  const idBySlug = new Map((products ?? []).map((product) => [product.slug, product.id]));
  const lines = input.lines.map((line) => ({
    product_id: idBySlug.get(line.slug),
    quantity: line.quantity,
  }));
  if (lines.some((line) => line.product_id === undefined)) {
    // Same vocabulary the database would have used, so the caller maps one error set.
    throw new Error("GD_PRICING_PRODUCT_UNAVAILABLE");
  }

  const { contact } = input;
  // Empty strings are what the SQL already normalises to null via nullif(trim(...), ''),
  // so optional fields need no nullable cast around the generated RPC types.
  const address = {
    recipient: `${contact.firstName} ${contact.lastName}`.trim(),
    street: contact.address,
    city: contact.city,
    postal_code: contact.postalCode,
    province: contact.province,
    country: "IT",
    // `create_order` takes no note parameter; courier instructions belong to the
    // delivery snapshot anyway, which is where they are preserved.
    notes: contact.notes ?? "",
  };

  const { data: orderId, error } = await client.rpc("create_order", {
    p_email: contact.email,
    p_phone: contact.phone,
    p_shipping_address: address,
    p_billing_address: address,
    p_lines: lines,
    p_coupon_code: input.couponCode ?? "",
    p_shipping_code: contact.shippingMethod,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  if (typeof orderId !== "number") throw new Error("GD_ORDER_INVALID_PAYLOAD");

  const { data: row } = await client
    .from("orders")
    .select("order_number,total_cents")
    .eq("id", orderId)
    .maybeSingle();

  return {
    orderNumber: row?.order_number ?? formatOrderNumber(orderId),
    total:
      typeof row?.total_cents === "number"
        ? { amount: row.total_cents, currency: "EUR" }
        : null,
  };
}
