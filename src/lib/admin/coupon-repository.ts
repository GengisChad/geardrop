import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PricingOption } from "./promotion-repository";

type Coupon = Database["public"]["Tables"]["coupons"]["Row"];
export type CouponEditorData = { readonly coupon: Coupon; readonly productIds: readonly number[]; readonly categoryIds: readonly number[]; readonly bundleIds: readonly number[]; readonly affectedProducts: readonly PricingOption[]; readonly redemptionCount: number };

/**
 * A Stripe order only names its code, so the ledger stays empty for it: the live orders that carry
 * the code are the real count, the same one the cart holds a usage limit to.
 */
export async function listCoupons(client: SupabaseClient<Database>) {
  const [result, orders] = await Promise.all([
    client.from("coupons").select("*, coupon_redemptions(count)").order("created_at", { ascending: false }),
    client.from("orders").select("coupon_code").not("coupon_code", "is", null).neq("status", "cancelled"),
  ]);
  if (result.error || orders.error) throw new Error("Impossibile caricare i coupon");
  const uses = new Map<string, number>();
  for (const order of orders.data ?? []) {
    if (order.coupon_code) uses.set(order.coupon_code, (uses.get(order.coupon_code) ?? 0) + 1);
  }
  return (result.data ?? []).map((coupon) => ({
    ...coupon,
    redemptionCount: Math.max(coupon.coupon_redemptions[0]?.count ?? 0, uses.get(coupon.code) ?? 0),
  }));
}

export async function loadCouponEditor(client: SupabaseClient<Database>, id: number): Promise<CouponEditorData | null> {
  const [coupon, products, categories, bundles, redemptions, productRows] = await Promise.all([
    client.from("coupons").select("*").eq("id", id).maybeSingle(),
    client.from("coupon_products").select("product_id").eq("coupon_id", id),
    client.from("coupon_categories").select("category_id").eq("coupon_id", id),
    client.from("coupon_bundles").select("bundle_id").eq("coupon_id", id),
    client.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", id),
    client.from("products").select("id,name,sku").order("name").limit(500),
  ]);
  if (coupon.error || products.error || categories.error || bundles.error || redemptions.error || productRows.error) throw new Error("Impossibile caricare il coupon");
  if (!coupon.data) return null;
  const orders = await client.from("orders").select("id", { count: "exact", head: true }).eq("coupon_code", coupon.data.code).neq("status", "cancelled");
  if (orders.error) throw new Error("Impossibile caricare il coupon");
  const productIds = products.data?.map((item) => item.product_id) ?? [];
  return { coupon: coupon.data, productIds, categoryIds: categories.data?.map((item) => item.category_id) ?? [], bundleIds: bundles.data?.map((item) => item.bundle_id) ?? [], affectedProducts: (productRows.data ?? []).filter((item) => productIds.includes(item.id)).map((item) => ({ id: item.id, label: item.name, meta: item.sku })), redemptionCount: Math.max(redemptions.count ?? 0, orders.count ?? 0) };
}
