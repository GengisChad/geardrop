import { PRODUCTS } from "@/data/catalog";

/**
 * Which products are sold before their release: the catalogue says so (Product.releasePreorder)
 * and the database has no column for it, so the database-backed provider, the Stripe order
 * mapping and the buyer's email all read it from here. Server side only: it loads the catalogue.
 */
const RELEASE_PREORDER = new Set<string>(PRODUCTS.filter((product) => product.releasePreorder).map((product) => product.slug));

export function isReleasePreorder(slug: string): boolean {
  return RELEASE_PREORDER.has(slug);
}
