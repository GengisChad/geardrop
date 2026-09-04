type SluggedProduct = { readonly slug: string };

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
