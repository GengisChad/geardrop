import "server-only";

import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { readSiteCoupon, type BuyerHistory, type SiteCouponLookup } from "./cart-code";

/** A stalled database must not hold the cart: the code then waits, and the buyer is told. */
const COUPON_TIMEOUT_MS = 4_000;

/**
 * Reads a coupon made in /admin/coupon. Uncached on purpose: one switched off in the admin stops at
 * the next quote. The table is closed to the public, so that codes cannot be listed; only the exact
 * code asked for is read, with the server's own key. That key sees every company's rows, so each
 * query names the shop's company: another company's code, or its orders, never count here.
 *
 * `buyerEmail` comes from the checkout form. Orders store it lowercased, as it is matched here.
 */
export async function findSiteCoupon(code: string, buyerEmail?: string): Promise<SiteCouponLookup> {
  if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() || !process.env["SUPABASE_SECRET_KEY"]?.trim()) return { status: "unknown" };
  try {
    const client = createPrivilegedSupabaseClient();
    const signal = AbortSignal.timeout(COUPON_TIMEOUT_MS);
    const organizationId = await storefrontOrganizationId();
    const found = await client
      .from("coupons")
      .select("*, coupon_products(products(slug)), coupon_categories(categories(slug)), coupon_bundles(bundles(slug))")
      .eq("organization_id", organizationId)
      .eq("code", code)
      .abortSignal(signal)
      .maybeSingle();
    if (found.error) throw new Error(found.error.message);
    const row = found.data;
    if (!row) return { status: "unknown" };

    let usedCount = 0;
    if (row.usage_limit !== null) {
      // A cancelled order gives its use back. Stripe orders name their code only here, not in the ledger.
      const orders = await client
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("coupon_code", row.code)
        .neq("status", "cancelled")
        .abortSignal(signal);
      if (orders.error) throw new Error(orders.error.message);
      usedCount = orders.count ?? 0;
    }

    let buyer: BuyerHistory | null = null;
    const email = buyerEmail?.trim().toLowerCase();
    if (email && (row.first_purchase_only || row.per_customer_limit !== null)) {
      const liveOrders = () => client.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("email", email).neq("status", "cancelled");
      const [orders, withCode] = await Promise.all([liveOrders().abortSignal(signal), liveOrders().eq("coupon_code", row.code).abortSignal(signal)]);
      if (orders.error || withCode.error) throw new Error((orders.error ?? withCode.error)?.message);
      buyer = { orders: orders.count ?? 0, ordersWithCode: withCode.count ?? 0 };
    }

    return readSiteCoupon(
      row,
      {
        productSlugs: row.coupon_products.map((target) => target.products.slug),
        categorySlugs: row.coupon_categories.map((target) => target.categories.slug),
        bundleSlugs: row.coupon_bundles.map((target) => target.bundles.slug),
      },
      usedCount,
      new Date(),
      buyer,
    );
  } catch (error) {
    console.error("[site-coupons] code not checked:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}
