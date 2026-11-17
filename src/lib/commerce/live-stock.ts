import "server-only";

import { PRODUCTS } from "@/data/catalog";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { applyLiveStock, type LiveStockRow } from "./live-stock-overlay";
import type { Product } from "./types";

/**
 * The reviewed catalogue with today's stock.
 *
 * Product copy, prices and images stay in src/data/catalog.ts, but availability lives in the
 * database, where every paid Stripe order takes the pieces it sold. A product the owner lets run
 * past its stock comes back as "pre-ordine" at zero and keeps selling. The read is cached under
 * the products tag, which the webhook expires after each order. Without a Supabase project, or
 * if the read fails, the catalogue's own numbers are served rather than an error page.
 */
/**
 * How long the stock read may take before the catalogue's own numbers are served instead.
 *
 * Without a bound, a database that stalls rather than fails — a restarting container, an
 * exhausted pool — holds every catalogue request open until the visitor gives up: the
 * catch below only ever sees errors, never silence. The read is one small query; four
 * seconds is generous for it and short enough that a shopper still gets a page.
 */
const LIVE_STOCK_TIMEOUT_MS = 4_000;

export async function loadLiveCatalogue(): Promise<readonly Product[]> {
  if (!hasPublicSupabaseEnv()) return PRODUCTS;
  try {
    const rows = await cacheStorefrontRead(["commerce", "live-stock"], [STOREFRONT_CACHE_TAGS.products], async () => {
      const result = await createSupabasePublicClient()
        .from("products")
        .select("slug,stock_status,stock_quantity,preorder_allocation,availability_override,allow_backorder")
        .eq("organization_id", await storefrontOrganizationId())
        .in(
          "slug",
          PRODUCTS.map((product) => product.slug),
        )
        .abortSignal(AbortSignal.timeout(LIVE_STOCK_TIMEOUT_MS));
      if (result.error) throw new Error(result.error.message);
      return result.data as readonly LiveStockRow[];
    });
    return applyLiveStock(PRODUCTS, rows);
  } catch (error) {
    console.error("[live-stock] serving catalogue stock:", error instanceof Error ? error.message : error);
    return PRODUCTS;
  }
}
