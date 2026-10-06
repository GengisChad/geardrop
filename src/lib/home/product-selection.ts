type SluggedProduct = { readonly slug: string };

/**
 * How many products the homepage's first shelf shows. The reviewed catalogue is small, so
 * that shelf carries all of it; the later fallback shelves would otherwise receive only the
 * leftovers, under headings such as "Pre-ordini aperti" that describe nothing.
 */
export const HOME_FEATURED_LIMIT = 12;

/** Products the owner flags as new releases lead the homepage under "Nuove uscite". */
export function newReleases<T extends { readonly tags: readonly string[] }>(products: readonly T[]): readonly T[] {
  return products.filter((product) => product.tags.includes("novita"));
}

type PlannedProduct = {
  readonly slug: string;
  readonly tags: readonly string[];
  readonly stock: string;
  readonly bundleOf?: unknown;
  readonly variant?: unknown;
};

/**
 * What leads the homepage. Owner, 2026-10-05: "sposterei la sezione dei più venduti sopra ai
 * pre-order".
 *
 * From paid orders up to that day: Suppress Superion 15 pieces (sold out and not dealt, so
 * not listed), Glory Valkerion 13, Wand Wizard 11. Impact Drake and Hover Wyvern sold by hand
 * out of six opened Battle Sets before either had a page, which is what got them listed.
 *
 * Kept by hand, in this order, because the product model carries no sales figure to rank by
 * — `reviewCount` is zero everywhere and "popolari" therefore orders nothing. The label is
 * only honest while the list is the sales record, so revisit it when the record moves.
 */
export const BESTSELLER_SLUGS: readonly string[] = [
  "glory-valkerion-lf",
  "wand-wizard-1-60r",
  "impact-drake-9-60lr",
  "hover-wyvern-3-85n",
];

/**
 * The homepage in the owner's order (2026-10-05): the best sellers lead, then the new releases
 * still on pre-order, then what ships right away (single pieces, then bundles, then
 * accessories), then everything else with sold-out pieces last. Every product appears once.
 *
 * When none of the best sellers can be sold the hero falls back to the September order — the
 * new releases, or failing those anything on sale — rather than dealing an empty first screen.
 */
export function homepagePlan<T extends PlannedProduct>(
  products: readonly T[],
  heroLimit: number,
  bestsellers: readonly string[] = BESTSELLER_SLUGS,
) {
  const onSale = (product: T) => product.stock !== "esaurito";
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const best = bestsellers
    .map((slug) => bySlug.get(slug))
    .filter((product): product is T => product !== undefined && onSale(product))
    .slice(0, heroLimit);
  const releases = newReleases(products).filter(onSale);
  const heroIsBestsellers = best.length > 0;
  const hero = heroIsBestsellers ? best : (releases.length > 0 ? releases : products.filter(onSale)).slice(0, heroLimit);
  const taken = new Set(hero.map((product) => product.slug));
  // The new releases get a row of their own once the best sellers hold the first screen.
  const drop = heroIsBestsellers ? releases.filter((product) => !taken.has(product.slug)) : [];
  for (const product of drop) taken.add(product.slug);
  const kind = (product: T) => (product.bundleOf ? 1 : product.variant ? 2 : 0);
  const ready = products
    .filter((product) => !taken.has(product.slug) && product.stock === "disponibile")
    .map((product, index) => ({ product, index }))
    .sort((a, b) => kind(a.product) - kind(b.product) || a.index - b.index)
    .map(({ product }) => product);
  for (const product of ready) taken.add(product.slug);
  const others = products.filter((product) => !taken.has(product.slug));
  return {
    hero,
    heroIsBestsellers,
    heroIsNewRelease: !heroIsBestsellers && releases.length > 0,
    drop,
    ready,
    rest: [...others.filter(onSale), ...others.filter((product) => !onSale(product))],
  };
}

/**
 * Assign each product to its first homepage section only. Section order and the order
 * inside each section stay authoritative; later sections receive only products the
 * visitor has not already seen on the page.
 */
export function allocateUniqueProductSections<T extends SluggedProduct>(
  sections: readonly (readonly T[] | undefined)[],
): readonly (readonly T[] | undefined)[] {
  const seen = new Set<string>();

  return sections.map((products) => {
    if (products === undefined) return undefined;

    return products.filter((product) => {
      if (seen.has(product.slug)) return false;
      seen.add(product.slug);
      return true;
    });
  });
}
