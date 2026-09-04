import Link from "next/link";
import { CATEGORIES } from "@/data/catalog";
import { selectHomepageCategories } from "@/lib/home/category-selection";
import type { CategorySlug } from "@/lib/commerce/types";

/**
 * The tiles. Order and selection can come from the CMS (`categorySlugs`); when it selects
 * nothing renderable the standard catalogue set stands in. Labels always come from the
 * catalogue data keyed by slug, so a managed order cannot change their destination.
 */
const RENDERABLE_TILE_SLUGS = new Set<CategorySlug>(CATEGORIES.map((category) => category.slug));

export function CategoryTiles({ categorySlugs }: { categorySlugs?: readonly CategorySlug[] } = {}) {
  const categories = selectHomepageCategories(CATEGORIES, categorySlugs, RENDERABLE_TILE_SLUGS);

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <h2 className="sr-only">Categorie</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/negozio/${category.slug}`}
              className="gd-glass-card gd-glass-interactive group relative flex min-h-24 items-center justify-center overflow-hidden rounded-[--radius-glass] px-4 py-6 text-center sm:min-h-28 md:min-h-32"
            >
              <h3 className="gd-display-wide text-[0.9375rem] font-extrabold leading-tight text-graphite transition-colors duration-300 group-hover:text-violet sm:text-[1.125rem] lg:text-h3">
                {category.name}
              </h3>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
