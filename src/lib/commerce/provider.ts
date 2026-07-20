import "server-only";

import { createMockProvider } from "./mock-provider";
import { createSupabaseCommerceProvider } from "./supabase-provider";
import type { CommerceProvider } from "./types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";

export type ProviderName = "mock" | "supabase";

export function resolveCommerceProviderName(
  value: string | undefined = process.env["COMMERCE_PROVIDER"] ?? "mock",
): ProviderName {
  if (value === "mock" || value === "supabase") return value;
  throw new Error(`Provider commerce non supportato: ${value}`);
}

function cachedSupabaseProvider(): CommerceProvider {
  const provider = createSupabaseCommerceProvider(createSupabasePublicClient());
  const tags = [
    STOREFRONT_CACHE_TAGS.products,
    STOREFRONT_CACHE_TAGS.categories,
    STOREFRONT_CACHE_TAGS.promotions,
  ];

  return {
    name: "supabase",
    getProduct: (slug) =>
      cacheStorefrontRead(["commerce", "product", slug], tags, () => provider.getProduct(slug)),
    getProductsBySlugs: (slugs) =>
      cacheStorefrontRead(["commerce", "products-by-slug", ...slugs], tags, () =>
        provider.getProductsBySlugs(slugs),
      ),
    listProducts: (query) =>
      cacheStorefrontRead(["commerce", "list", JSON.stringify(query ?? {})], tags, () =>
        provider.listProducts(query),
      ),
    getFacets: (query) =>
      cacheStorefrontRead(["commerce", "facets", JSON.stringify(query ?? {})], tags, () =>
        provider.getFacets(query),
      ),
    listCategories: () =>
      cacheStorefrontRead(["commerce", "categories"], tags, () => provider.listCategories()),
    getCategory: (slug) =>
      cacheStorefrontRead(["commerce", "category", slug], tags, () => provider.getCategory(slug)),
    getBundle: () => cacheStorefrontRead(["commerce", "bundle"], tags, () => provider.getBundle()),
    // Deliberately uncached: a quote reads live stock and live order intake, and two
    // shoppers holding the same cart must never share a cached answer.
    quoteCart: (request) => provider.quoteCart(request),
  };
}

export async function getCommerceProvider(): Promise<CommerceProvider> {
  const requested = resolveCommerceProviderName();
  return requested === "mock" ? createMockProvider() : cachedSupabaseProvider();
}

export const commerce: CommerceProvider = createMockProvider();
export type { CommerceProvider };
