import "server-only";

import type { CommerceProvider, Product } from "@/lib/commerce/types";
import type { HomepageSection } from "@/lib/content/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * A managed section with its bigint relations resolved to storefront domain objects.
 *
 * The CMS stores relations as `products.id` (bigint); the storefront speaks in slugs.
 * This turns one into the other server-side, batched, so the renderer never sees an id
 * and the browser never issues a query. Order is the CMS order; unpublished or
 * out-of-catalogue targets simply drop out.
 */
export type ResolvedHomepageSection = {
  readonly section: HomepageSection;
  readonly products: readonly Product[];
};

const PRODUCT_SECTION_TYPES = new Set([
  "featured_products",
  "latest_drops",
  "bestsellers",
  "competitive_products",
  "new_arrivals",
  "offers",
]);

/**
 * Resolve every managed section's product relations in two round trips total, whatever
 * the number of sections: one id→slug lookup for all ids at once, one catalogue read for
 * all slugs at once. Both go through the RLS-bound public client — no service-role key,
 * nothing an anonymous visitor could not already read.
 *
 * A section whose relations are empty (or whose targets are all unpublished) comes back
 * with an empty product list; the renderer then falls back to that section's default
 * query rather than showing a gap.
 */
export async function resolveHomepageSections(
  sections: readonly HomepageSection[],
  commerce: CommerceProvider,
): Promise<readonly ResolvedHomepageSection[]> {
  const allIds = [
    ...new Set(
      sections.flatMap((section) => (PRODUCT_SECTION_TYPES.has(section.section_type) ? section.productIds : [])),
    ),
  ];

  if (allIds.length === 0) {
    return sections.map((section) => ({ section, products: [] }));
  }

  // id → slug for every referenced product, published and active only.
  const client = createSupabasePublicClient();
  const { data: rows } = await client
    .from("products")
    .select("id, slug")
    .in("id", allIds)
    .eq("publication_status", "published")
    .eq("active", true);

  const slugById = new Map<number, string>((rows ?? []).map((row) => [row.id, row.slug]));
  const wantedSlugs = [...new Set([...slugById.values()])];

  // One catalogue read for all of them, then index by slug so each section can pick its
  // own in its own order.
  const products = wantedSlugs.length > 0 ? await commerce.getProductsBySlugs(wantedSlugs) : [];
  const productBySlug = new Map<string, Product>(products.map((product) => [product.slug, product]));

  return sections.map((section) => {
    if (!PRODUCT_SECTION_TYPES.has(section.section_type)) {
      return { section, products: [] };
    }

    const resolved = section.productIds
      .map((id) => slugById.get(id))
      .filter((slug): slug is string => slug !== undefined)
      .map((slug) => productBySlug.get(slug))
      .filter((product): product is Product => product !== undefined);

    return { section, products: resolved };
  });
}
