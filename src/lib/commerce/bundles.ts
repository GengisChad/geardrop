import type { BundleComponent, Product, StockStatus } from "./types";

/**
 * Bundles sold as one item draw on their components' stock. A duo exists only while every pack
 * in it does: its availability is how many complete sets the components can still make up, and
 * each sale takes those pieces.
 */

/** Worst status first: one sold-out component sells the whole bundle out. */
const STOCK_PRIORITY: readonly StockStatus[] = ["esaurito", "in-arrivo", "pre-ordine", "disponibile"];

export function resolveBundle(bundle: Product, bySlug: ReadonlyMap<string, Product>): Product {
  const parts = (bundle.bundleOf ?? []).map((component) => ({ component, product: bySlug.get(component.slug) }));
  if (parts.length === 0 || parts.some((part) => !part.product)) return { ...bundle, stock: "esaurito", availableQuantity: 0 };

  const sets = parts.map(({ component, product }) =>
    product!.stock === "esaurito"
      ? 0
      : product!.availableQuantity === undefined
        ? undefined
        : Math.floor(Math.max(product!.availableQuantity, 0) / component.quantity),
  );
  const known = sets.filter((count): count is number => count !== undefined);
  const available = known.length > 0 ? Math.min(...known) : bundle.availableQuantity;
  // A duo keeps selling as a pre-order only when every pack in it does.
  const autoPreorder = parts.every((part) => part.product!.autoPreorder === true);
  const status =
    available === 0
      ? autoPreorder
        ? "pre-ordine"
        : "esaurito"
      : (STOCK_PRIORITY.find((candidate) => parts.some((part) => part.product!.stock === candidate)) ?? bundle.stock);

  const resolved = { ...bundle, stock: status, ...(autoPreorder ? { autoPreorder: true } : {}) };
  // With no component counting its stock, the bundle keeps its own catalogue figure, if any.
  return available === undefined ? resolved : { ...resolved, availableQuantity: available };
}

/** The storefront catalogue: bundles first, with the stock their components hold right now. */
export function withBundles(products: readonly Product[], bundles: readonly Product[]): readonly Product[] {
  const bySlug = new Map(products.map((product) => [product.slug as string, product]));
  return [...bundles.map((bundle) => resolveBundle(bundle, bySlug)), ...products];
}

/** The catalogue products a cart line takes: a bundle's components, or the product itself. */
export function piecesOf(product: Product, quantity: number): readonly BundleComponent[] {
  return product.bundleOf
    ? product.bundleOf.map((component) => ({ slug: component.slug, quantity: component.quantity * quantity }))
    : [{ slug: product.slug, quantity }];
}

/** Bundles that contain this product, for the "take them together" offer on its page. */
export function bundlesContaining(slug: string, catalogue: readonly Product[]): readonly Product[] {
  return catalogue.filter((item) => item.bundleOf?.some((component) => component.slug === slug));
}
