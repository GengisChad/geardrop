import type { BundleComponent, CartQuoteLine, Product } from "./types";

/**
 * The one bundle the cart offers next to its lines.
 *
 * A piece can sit in several bundles (a Soar Phoenix is in the tournament deck and in three
 * packs), and one box per bundle buried the cart on a phone. The cart shows a single offer: the
 * one the buyer is closest to.
 */

type OfferLine = Pick<CartQuoteLine, "slug" | "quantity" | "unitPrice" | "issue">;
type OfferBundle = Pick<Product, "slug" | "name" | "price" | "stock" | "bundleOf">;

export type BundleOffer<B extends OfferBundle = OfferBundle> = {
  readonly bundle: B;
  readonly components: readonly BundleComponent[];
  /** Pieces of the bundle the cart does not hold yet; empty when it holds them all. */
  readonly missing: readonly BundleComponent[];
  /** What the bundle costs on top of the pieces already in the cart, in cents; negative when it costs less than they do. */
  readonly extra: number;
  /** What the missing pieces cost bought on their own, in cents. */
  readonly missingCost: number;
  /** What the buyer keeps by taking the bundle instead of the single pieces, in cents. Always positive. */
  readonly saving: number;
};

const pieces = (components: readonly BundleComponent[]) => components.reduce((sum, component) => sum + component.quantity, 0);

/** Every bundle the cart is partway into and that really costs less than its pieces. */
export function bundleOffers<B extends OfferBundle>(
  lines: readonly OfferLine[],
  bundles: readonly B[],
  /** Today's price of a piece that is not in the cart, in cents. */
  priceOf: (slug: string) => number,
): BundleOffer<B>[] {
  return bundles.flatMap((bundle) => {
    const components = bundle.bundleOf ?? [];
    if (components.length === 0 || bundle.stock === "esaurito") return [];
    const present = components.filter((component) =>
      lines.some((line) => line.slug === component.slug && line.issue === null && line.quantity >= component.quantity),
    );
    if (present.length === 0) return [];
    const missing = components.filter((component) => !present.includes(component));
    // With the bundle already in the cart, "add the rest" would read as buying it twice.
    if (missing.length > 0 && lines.some((line) => line.slug === bundle.slug)) return [];
    // A piece the shop cannot price cannot be compared with the bundle.
    if (missing.some((component) => priceOf(component.slug) <= 0)) return [];
    const presentCost = present.reduce(
      (sum, component) => sum + (lines.find((line) => line.slug === component.slug)?.unitPrice.amount ?? 0) * component.quantity,
      0,
    );
    const missingCost = missing.reduce((sum, component) => sum + priceOf(component.slug) * component.quantity, 0);
    const extra = bundle.price.amount - presentCost;
    const saving = missingCost - extra;
    // Measured on what the cart charges today, not on the catalogue's crossed-out price.
    if (saving <= 0) return [];
    return [{ bundle, components, missing, extra, missingCost, saving }];
  });
}

/**
 * The offer to show. A bundle the cart already holds in full comes first: taking it costs
 * nothing more. Then the bundle with the fewest pieces to add, the smallest sum to add, and
 * the largest saving.
 */
export function bestBundleOffer<B extends OfferBundle>(offers: readonly BundleOffer<B>[]): BundleOffer<B> | null {
  const ranked = [...offers].sort(
    (left, right) =>
      Number(right.missing.length === 0) - Number(left.missing.length === 0) ||
      pieces(left.missing) - pieces(right.missing) ||
      (left.missing.length === 0 ? right.saving - left.saving : left.extra - right.extra) ||
      right.saving - left.saving ||
      left.bundle.slug.localeCompare(right.bundle.slug),
  );
  return ranked[0] ?? null;
}
