/**
 * Order and select homepage category tiles from a CMS slug list.
 *
 * The CMS controls which categories appear and in what order; tile labels always come
 * from the catalogue data keyed by slug. An unsupported slug is dropped, and an empty
 * (or fully unsupported) selection falls back to the full catalogue set — never an empty band.
 */
export function selectHomepageCategories<T extends { readonly slug: string }>(
  all: readonly T[],
  categorySlugs: readonly string[] | undefined,
  renderableSlugs: ReadonlySet<string>,
): readonly T[] {
  const bySlug = new Map(all.map((category) => [category.slug, category]));

  const selected = (categorySlugs ?? [])
    .map((slug) => bySlug.get(slug))
    .filter((category): category is T => category !== undefined && renderableSlugs.has(category.slug));

  return selected.length > 0 ? selected : all;
}
