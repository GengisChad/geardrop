import "server-only";

import { PRODUCTS } from "@/data/catalog";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { applyLiveStock, type LiveStockRow } from "./live-stock-overlay";
import type { Product } from "./types";

/**
 * The reviewed catalogue with today's stock.
 *
 * Product copy, prices and images stay in src/data/catalog.ts, but availability lives in the
 * database, where every paid Stripe order takes the pieces it sold. The read is cached under
 * the products tag, which the webhook expires after each order. Without a Supabase project, or
 * if the read fails, the catalogue's own numbers are served rather than an error page.
 */
export async function loadLiveCatalogue(): Promise<readonly Product[]> {
  if (!hasPublicSupabaseEnv()) return PRODUCTS;
  try {
    const rows = await cacheStorefrontRead(["commerce", "live-stock"], [STOREFRONT_CACHE_TAGS.products], async () => {
      const result = await createSupabasePublicClient()
        .from("products")
        .select("slug,stock_status,stock_quantity,preorder_allocation,availability_override")
        .in(
          "slug",
          PRODUCTS.map((product) => product.slug),
        );
      if (result.error) throw new Error(result.error.message);
      return result.data as readonly LiveStockRow[];
    });
    return applyLiveStock(PRODUCTS, rows);
  } catch (error) {
    console.error("[live-stock] serving catalogue stock:", error instanceof Error ? error.message : error);
    return PRODUCTS;
  }
}
