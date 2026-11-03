import "server-only";

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createInpostClient, inpostConfig, type TrackingEvent } from "@/lib/shipping/inpost";
import type { Database } from "@/lib/supabase/database.types";
import { liveTrackingCodes } from "./customer-order-status";

/**
 * The buyer's own orders for the account page, with where each parcel is (owner, 2026-11-03:
 * "abbia nel suo pannello ordine il tracking di dove sta il suo pacco senza che ci scrivano").
 */

export type CustomerOrderItem = { readonly name: string; readonly quantity: number; readonly preorderQuantity: number };

export type CustomerOrder = {
  readonly orderNumber: string;
  readonly status: string;
  readonly createdAt: string;
  readonly totalCents: number;
  readonly shippedAt: string | null;
  readonly deliveredAt: string | null;
  readonly trackingCarrier: string | null;
  readonly trackingCode: string | null;
  readonly trackingUrl: string | null;
  readonly items: readonly CustomerOrderItem[];
  /** InPost's events for a parcel still travelling, oldest first; null when InPost was not asked or did not answer. */
  readonly parcelEvents: readonly TrackingEvent[] | null;
};

/** How long InPost's answer is reused: a parcel moves a few times a day, a buyer may reload every minute. */
const PARCEL_CACHE_SECONDS = 600;
/** A slow InPost must not hold the account page: past this the page shows the code and the link only. */
const INPOST_TIMEOUT_MS = 4000;

const ORDER_COLUMNS =
  "order_number, status, total_cents, created_at, shipped_at, delivered_at, tracking_carrier, tracking_code, tracking_url, order_items(id, product_name_snapshot, quantity, preorder_quantity)";

/**
 * Every order of the signed-in buyer, newest first. RLS returns only their rows; the claim files
 * their guest orders under the account first, by confirmed email (migration 20261103120000).
 */
export async function loadCustomerOrders(client: SupabaseClient<Database>, limit = 10): Promise<readonly CustomerOrder[]> {
  const claimed = await client.rpc("claim_customer_orders");
  // Not fatal: the orders already filed still show, and the next visit claims again.
  if (claimed.error) console.error("[account] claim_customer_orders", claimed.error.message);

  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[account] orders", error.message);
    return [];
  }

  const orders = (data ?? []).map((row) => ({
    orderNumber: row.order_number,
    status: row.status,
    createdAt: row.created_at,
    totalCents: row.total_cents,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    trackingCarrier: row.tracking_carrier,
    trackingCode: row.tracking_code,
    trackingUrl: row.tracking_url,
    items: [...(row.order_items ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({ name: item.product_name_snapshot, quantity: item.quantity, preorderQuantity: item.preorder_quantity })),
  }));

  const live = liveTrackingCodes(orders);
  const journeys = await inpostJourneys(live);
  return orders.map((order) => {
    const code = order.trackingCode?.trim();
    // A parcel InPost answered nothing about has no movements yet: an empty journey, not an unknown one.
    return { ...order, parcelEvents: journeys && code && live.includes(code) ? journeys.get(code) ?? [] : null };
  });
}

/** InPost's events by tracking number. Null when InPost is not configured, slow or down. */
async function inpostJourneys(codes: readonly string[]): Promise<ReadonlyMap<string, readonly TrackingEvent[]> | null> {
  const config = inpostConfig();
  if (!config || codes.length === 0) return null;
  try {
    const parcels = await unstable_cache(
      async () => {
        const api = createInpostClient(config, (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(INPOST_TIMEOUT_MS) }),
        );
        const found = [];
        for (let start = 0; start < codes.length; start += 10) found.push(...(await api.track(codes.slice(start, start + 10))));
        return found;
      },
      // Keyed by tracking numbers only: InPost's answer holds no buyer data, so it can be reused.
      ["account", "inpost-tracking", ...codes],
      { revalidate: PARCEL_CACHE_SECONDS, tags: ["inpost-tracking"] },
    )();
    return new Map(parcels.map((parcel) => [parcel.trackingNumber, parcel.events]));
  } catch (error) {
    console.error("[account] InPost tracking", error instanceof Error ? error.message : error);
    return null;
  }
}
