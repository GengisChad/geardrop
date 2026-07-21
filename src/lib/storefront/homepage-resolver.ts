import "server-only";

import type { Bundle, CategorySlug, CommerceProvider, Product } from "@/lib/commerce/types";
import type { HomepageSection } from "@/lib/content/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * A managed section with its bigint relations resolved to storefront domain objects.
 *
 * The CMS stores relations as `products.id` / `categories.id` / `bundles.id` (bigint); the
 * storefront speaks in slugs. This turns one into the other server-side, batched, so the
 * renderer never sees an id and the browser never issues a query. Order is the CMS order;
 * unpublished or out-of-catalogue targets simply drop out.
 */
export type ResolvedHomepageSection = {
  readonly section: HomepageSection;
  readonly products: readonly Product[];
  readonly categorySlugs: readonly CategorySlug[];
  readonly bundle: { readonly bundle: Bundle; readonly hero: Product } | null;
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
 * Resolve every managed section's relations in a bounded number of round trips, whatever
 * the section count: one id→slug lookup per relation kind (products, categories, bundles),
 * then the catalogue reads. Everything goes through the RLS-bound public client — no
 * service-role key, nothing an anonymous visitor could not already read.
 *
 * A section whose relations are empty (or whose targets are all unpublished) comes back
 * empty; the renderer then falls back to that section's default rather than showing a gap.
 * A section that names a target which is not publishable comes back empty too — never a
 * different, silently-substituted one.
 */
export async function resolveHomepageSections(
  sections: readonly HomepageSection[],
  commerce: CommerceProvider,
): Promise<readonly ResolvedHomepageSection[]> {
  const client = createSupabasePublicClient();

  const productIds = [
    ...new Set(
      sections.flatMap((section) => (PRODUCT_SECTION_TYPES.has(section.section_type) ? section.productIds : [])),
    ),
  ];
  const categoryIds = [
    ...new Set(sections.flatMap((section) => (section.section_type === "categories" ? section.categoryIds : []))),
  ];
  const bundleIds = [
    ...new Set(sections.flatMap((section) => (section.section_type === "bundle" ? section.bundleIds : []))),
  ];

  // id → slug maps, published + active only, one batch query per relation kind.
  const [productRows, categoryRows, bundleRows] = await Promise.all([
    productIds.length > 0
      ? client.from("products").select("id, slug").in("id", productIds).eq("publication_status", "published").eq("active", true)
      : Promise.resolve({ data: [] as { id: number; slug: string }[] }),
    categoryIds.length > 0
      ? client.from("categories").select("id, slug").in("id", categoryIds).eq("publication_status", "published").eq("active", true)
      : Promise.resolve({ data: [] as { id: number; slug: string }[] }),
    bundleIds.length > 0
      ? client.from("bundles").select("id, slug").in("id", bundleIds).eq("active", true)
      : Promise.resolve({ data: [] as { id: number; slug: string }[] }),
  ]);

  const slugByProductId = new Map<number, string>((productRows.data ?? []).map((row) => [row.id, row.slug]));
  const slugByCategoryId = new Map<number, string>((categoryRows.data ?? []).map((row) => [row.id, row.slug]));
  const slugByBundleId = new Map<number, string>((bundleRows.data ?? []).map((row) => [row.id, row.slug]));

  // One catalogue read for every referenced product, then index by slug.
  const wantedSlugs = [...new Set([...slugByProductId.values()])];
  const products = wantedSlugs.length > 0 ? await commerce.getProductsBySlugs(wantedSlugs) : [];
  const productBySlug = new Map<string, Product>(products.map((product) => [product.slug, product]));

  return Promise.all(
    sections.map(async (section) => {
      const base = { section, products: [] as readonly Product[], categorySlugs: [] as readonly CategorySlug[], bundle: null as ResolvedHomepageSection["bundle"] };

      if (PRODUCT_SECTION_TYPES.has(section.section_type)) {
        const resolved = section.productIds
          .map((id) => slugByProductId.get(id))
          .filter((slug): slug is string => slug !== undefined)
          .map((slug) => productBySlug.get(slug))
          .filter((product): product is Product => product !== undefined);
        return { ...base, products: resolved };
      }

      if (section.section_type === "categories") {
        const slugs = section.categoryIds
          .map((id) => slugByCategoryId.get(id))
          .filter((slug): slug is string => slug !== undefined) as CategorySlug[];
        return { ...base, categorySlugs: slugs };
      }

      if (section.section_type === "bundle") {
        // First publishable bundle the section names, with its own hero product. A named
        // but unpublishable target resolves to null here, not to a substitute.
        for (const id of section.bundleIds) {
          const slug = slugByBundleId.get(id);
          if (!slug) continue;
          const bundle = await commerce.getBundleBySlug(slug);
          if (!bundle) continue;
          const hero = await commerce.getProduct(bundle.heroSlug);
          if (hero) return { ...base, bundle: { bundle, hero } };
        }
        return base;
      }

      return base;
    }),
  );
}
