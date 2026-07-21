/**
 * Order and select homepage category tiles from a CMS slug list.
 *
 * The CMS controls which categories appear and in what order; the tiles' art, name and
 * tagline always come from the catalogue data keyed by slug. A slug the tiles have no art
 * for is dropped rather than rendered broken, and an empty (or fully unrenderable)
 * selection falls back to the full catalogue set — never an empty band.
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
