import { VARIANT_FAMILIES, type VariantColour } from "@/data/variant-families";
import type { Product } from "./types";

/**
 * Colours of one item (the deck cases) are separate products: each has its own stock, Stripe
 * price and order line. The shop still shows the item once, and its page offers the colours.
 * Everything here reads the small family index, never the catalogue, so client bundles stay lean.
 */

/** Position of a colour inside its family: the lower, the more it leads. */
function rank(product: Pick<Product, "slug" | "variant">): number {
  const colours = product.variant ? VARIANT_FAMILIES[product.variant.family]?.colours ?? [] : [];
  const index = colours.findIndex((colour) => colour.slug === product.slug);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Lists each family once, where its first colour in the list stood. The card shown is the
 * family's leading colour among those the list holds, so a search or filter that matches only
 * some colours still finds the family, and the shop always leads with the same one.
 */
export function oneCardPerFamily<T extends Pick<Product, "slug" | "variant">>(products: readonly T[]): T[] {
  const shown = new Map<string, T>();
  for (const product of products) {
    const family = product.variant?.family;
    if (family === undefined) continue;
    const current = shown.get(family);
    if (current === undefined || rank(product) < rank(current)) shown.set(family, product);
  }
  const placed = new Set<string>();
  return products.flatMap((product) => {
    const family = product.variant?.family;
    if (family === undefined) return [product];
    if (placed.has(family)) return [];
    placed.add(family);
    return [shown.get(family) ?? product];
  });
}

/** Every colour of the product's family, in the order the page offers them; empty for a single item. */
export function familyColours(product: Pick<Product, "variant">): readonly VariantColour[] {
  return product.variant ? VARIANT_FAMILIES[product.variant.family]?.colours ?? [] : [];
}

/** The page that stands for the whole family in lists and search engines: its leading colour. */
export function familyLead(product: Pick<Product, "slug" | "variant">): Product["slug"] {
  return familyColours(product)[0]?.slug ?? product.slug;
}

/**
 * What the family index knows about a product that the database does not store: its colour and
 * whether it is a Hasbro product. The database-backed provider merges it by slug.
 */
export function catalogueTraits(slug: string): Pick<Product, "variant" | "unofficial"> {
  for (const [family, entry] of Object.entries(VARIANT_FAMILIES)) {
    const colour = entry.colours.find((candidate) => candidate.slug === slug);
    if (!colour) continue;
    return {
      variant: { family, familyName: entry.name, label: colour.label, swatch: colour.swatch },
      ...(entry.unofficial ? { unofficial: true as const } : {}),
    };
  }
  return {};
}
