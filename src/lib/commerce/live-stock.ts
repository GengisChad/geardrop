import "server-only";

import { PRODUCTS } from "@/data/catalog";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { applyLiveStock, type LiveStockRow } from "./live-stock-overlay";
import { applyStorefrontContent, type StorefrontContentRow } from "./storefront-content";
import type { Product } from "./types";

/**
 * The reviewed catalogue with today's stock and prices.
 *
 * Product copy and images stay in src/data/catalog.ts, but availability lives in the database,
 * where every paid Stripe order takes the pieces it sold, and so does the selling price, which the
 * owner changes from the back office (since 2026-11-19; the catalogue's figure is the fallback). A product the owner lets run
 * past its stock comes back as "pre-ordine" at zero and keeps selling. Since 2026-11-24 so does the
 * copy the back office changed on a product sheet (name, texts, details, photos: see
 * storefront-content.ts). The reads are cached under the products tag, which the webhook and every
 * save on the sheet expire. Without a Supabase project, or if the read fails, the catalogue's own
 * numbers and copy are served rather than an error page.
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

const CONTENT_SELECT = `
  slug,
  storefront_fields,
  name,
  tagline,
  description,
  blade_type,
  category:categories(slug),
  specs:product_specs(label,value,sort_order),
  features:product_features(title,description,sort_order),
  box_contents:product_box_contents(content,sort_order),
  images:product_images(src,width,height,alt,sort_order,published,is_primary),
  tags:product_tags(tag)
`;

/**
 * The rows whose copy the back office changed. A read apart from the stock one, and allowed to
 * fail on its own: before migration 20261124120000 adds storefront_fields it errors, and the shop
 * keeps selling with the catalogue's copy and the live stock and prices.
 */
async function readSheetContent(organizationId: number): Promise<readonly StorefrontContentRow[]> {
  const result = await createSupabasePublicClient()
    .from("products")
    .select(CONTENT_SELECT)
    .eq("organization_id", organizationId)
    .in(
      "slug",
      PRODUCTS.map((product) => product.slug),
    )
    .filter("storefront_fields", "neq", "{}")
    .abortSignal(AbortSignal.timeout(LIVE_STOCK_TIMEOUT_MS));
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown as readonly StorefrontContentRow[];
}

async function loadSheetContent(organizationId: number, fresh = false): Promise<readonly StorefrontContentRow[]> {
  try {
    if (fresh) return await readSheetContent(organizationId);
    return await cacheStorefrontRead(["commerce", "sheet-content"], [STOREFRONT_CACHE_TAGS.products], () => readSheetContent(organizationId));
  } catch (error) {
    console.error("[live-stock] serving catalogue copy:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Today's stock and prices, one row per catalogue product the database knows. */
async function readLiveStock(organizationId: number): Promise<readonly LiveStockRow[]> {
  const result = await createSupabasePublicClient()
    .from("products")
    .select("slug,stock_status,stock_quantity,preorder_allocation,availability_override,allow_backorder,price_cents,compare_at_price_cents")
    .eq("organization_id", organizationId)
    .in(
      "slug",
      PRODUCTS.map((product) => product.slug),
    )
    .abortSignal(AbortSignal.timeout(LIVE_STOCK_TIMEOUT_MS));
  if (result.error) throw new Error(result.error.message);
  return result.data as readonly LiveStockRow[];
}

export async function loadLiveCatalogue(): Promise<readonly Product[]> {
  if (!hasPublicSupabaseEnv()) return PRODUCTS;
  try {
    const organizationId = await storefrontOrganizationId();
    const [rows, content] = await Promise.all([
      cacheStorefrontRead(["commerce", "live-stock"], [STOREFRONT_CACHE_TAGS.products], () => readLiveStock(organizationId)),
      loadSheetContent(organizationId),
    ]);
    return applyStorefrontContent(applyLiveStock(PRODUCTS, rows), content);
  } catch (error) {
    console.error("[live-stock] serving catalogue stock:", error instanceof Error ? error.message : error);
    return PRODUCTS;
  }
}

/**
 * The same catalogue read straight from the database, past the cache, for whoever announces what
 * the shop sells (the Telegram news bot). It throws where loadLiveCatalogue falls back: the
 * catalogue's own figures are good enough to keep a page up, but an announcement made from them
 * would call a sold-out piece available.
 */
export async function loadFreshCatalogue(): Promise<readonly Product[]> {
  const organizationId = await storefrontOrganizationId();
  const [rows, content] = await Promise.all([readLiveStock(organizationId), loadSheetContent(organizationId, true)]);
  return applyStorefrontContent(applyLiveStock(PRODUCTS, rows), content);
}
