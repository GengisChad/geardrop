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
 * The homepage in the owner's order (2026-09-21): the new releases still on sale lead, then
 * what ships right away (single pieces, then bundles, then accessories), then everything else
 * with sold-out pieces last. Every product appears once.
 */
export function homepagePlan<T extends PlannedProduct>(products: readonly T[], heroLimit: number) {
  const onSale = (product: T) => product.stock !== "esaurito";
  const releases = newReleases(products).filter(onSale);
  const hero = (releases.length > 0 ? releases : products.filter(onSale)).slice(0, heroLimit);
  const taken = new Set(hero.map((product) => product.slug));
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
    heroIsNewRelease: releases.length > 0,
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
