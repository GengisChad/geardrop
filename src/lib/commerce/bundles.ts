import { SPOTLIGHT_SLUGS } from "@/lib/home/product-selection";
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

  const partsCents = parts.reduce((sum, { component, product }) => sum + product!.price.amount * component.quantity, 0);
  const resolved = { ...withPartsTotal(bundle, partsCents), stock: status, ...(autoPreorder ? { autoPreorder: true } : {}) };
  // With no component counting its stock, the bundle keeps its own catalogue figure, if any.
  return available === undefined ? resolved : { ...resolved, availableQuantity: available };
}

/** "€15,89": the way the bundles' copy writes an amount. */
function euro(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

const SAVING_IN_TAGLINE = /€\d+,\d{2} in meno/;
const SAVING_CLAUSE_IN_TAGLINE = /[,.]?\s*€\d+,\d{2} in meno\.?/;
const PRICES_IN_CLAIM = /€\d+,\d{2} invece di €\d+,\d{2}/;

/**
 * The bundle struck through at what its packs cost today. A bundle's own price is fixed in the
 * catalogue, but its packs take the price the back office holds (2026-11-19), so the struck-through
 * figure and every "€X in meno" / "Risparmi €X" line follow the packs. A bundle that no longer costs
 * less than its packs keeps selling with no saving claimed: its price is the owner's to change.
 */
export function withPartsTotal(bundle: Product, partsCents: number): Product {
  if (bundle.compareAtPrice?.amount === partsCents) return bundle;
  const saving = partsCents - bundle.price.amount;
  if (saving <= 0) {
    const copy: { -readonly [Key in keyof Product]?: Product[Key] } = {
      ...bundle,
      tagline: bundle.tagline.replace(SAVING_CLAUSE_IN_TAGLINE, "."),
      features: bundle.features.filter((feature) => !feature.title.startsWith("Risparmi")),
    };
    delete copy.compareAtPrice;
    return copy as Product;
  }
  return {
    ...bundle,
    compareAtPrice: { amount: partsCents, currency: bundle.price.currency },
    tagline: bundle.tagline.replace(SAVING_IN_TAGLINE, `${euro(saving)} in meno`),
    features: bundle.features.map((feature) =>
      feature.title.startsWith("Risparmi")
        ? {
            ...feature,
            title: `Risparmi ${euro(saving)}`,
            description: feature.description.replace(PRICES_IN_CLAIM, `${euro(bundle.price.amount)} invece di ${euro(partsCents)}`),
          }
        : feature,
    ),
  };
}

/**
 * The storefront catalogue: what the owner has in the spotlight (2026-11-06), then the bundles with
 * the stock their components hold right now, then the other products.
 */
export function withBundles(products: readonly Product[], bundles: readonly Product[]): readonly Product[] {
  const bySlug = new Map(products.map((product) => [product.slug as string, product]));
  const inSpotlight = (product: Product) => SPOTLIGHT_SLUGS.includes(product.slug);
  return [
    ...products.filter(inSpotlight),
    ...bundles.map((bundle) => resolveBundle(bundle, bySlug)),
    ...products.filter((product) => !inSpotlight(product)),
  ];
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
