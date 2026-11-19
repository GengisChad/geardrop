import { BUNDLES, PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";

const CATALOGUE_PRICE = new Map(PRODUCTS.map((product) => [product.slug as string, product.price.amount]));

/** Every product slug inside a bundle that holds this one, this one included. */
export function bundlePartnersOf(slug: string, bundles: readonly Product[] = BUNDLES): readonly string[] {
  return [
    ...new Set(
      bundles
        .filter((bundle) => bundle.bundleOf?.some((part) => part.slug === slug))
        .flatMap((bundle) => (bundle.bundleOf ?? []).map((part) => part.slug as string)),
    ),
  ];
}

/**
 * The bundles that would no longer cost less than their packs once this product sells at the new
 * price. A bundle's own price is fixed in the catalogue, while its packs follow the back office
 * (2026-11-19): the shop then stops claiming a saving on it, and the owner should hear about it
 * when saving the price, not from a customer.
 */
export function bundlesLosingTheirSaving(
  slug: string,
  newPriceCents: number,
  livePrices: ReadonlyMap<string, number>,
  bundles: readonly Product[] = BUNDLES,
): readonly Product[] {
  return bundles.filter((bundle) => {
    const parts = bundle.bundleOf ?? [];
    if (!parts.some((part) => part.slug === slug)) return false;
    const partsCents = parts.reduce((sum, part) => {
      const price = part.slug === slug ? newPriceCents : (livePrices.get(part.slug) ?? CATALOGUE_PRICE.get(part.slug) ?? 0);
      return sum + price * part.quantity;
    }, 0);
    return partsCents <= bundle.price.amount;
  });
}
