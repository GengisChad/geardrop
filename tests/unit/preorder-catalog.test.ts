import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

describe("reviewed catalogue", () => {
  it("publishes exactly the nine owner-supplied products and allocations", () => {
    expect(
      PRODUCTS.map(({ slug, price, stock, availableQuantity, rating, reviewCount }) => ({
        slug,
        price: price.amount,
        stock,
        availableQuantity,
        rating,
        reviewCount,
      })),
    ).toEqual([
      { slug: "cobalt-dragoon-2-60c", price: 2550, stock: "disponibile", availableQuantity: 10, rating: 0, reviewCount: 0 },
      { slug: "soar-phoenix-9-60gf", price: 3200, stock: "disponibile", availableQuantity: 60, rating: 0, reviewCount: 0 },
      { slug: "saber-samurai-2-70l", price: 2790, stock: "disponibile", availableQuantity: 30, rating: 0, reviewCount: 0 },
      { slug: "blast-pegasus-a-tr", price: 2950, stock: "disponibile", availableQuantity: 30, rating: 0, reviewCount: 0 },
      { slug: "drop-attack-battle-set", price: 4650, stock: "disponibile", availableQuantity: 30, rating: 0, reviewCount: 0 },
      { slug: "sneak-attack-battle-set", price: 4500, stock: "disponibile", availableQuantity: 30, rating: 0, reviewCount: 0 },
      { slug: "glory-valkerion-lf", price: 3000, stock: "disponibile", availableQuantity: 8, rating: 0, reviewCount: 0 },
      { slug: "hurricane-enlil-is-7-55t", price: 2000, stock: "disponibile", availableQuantity: 10, rating: 0, reviewCount: 0 },
      { slug: "shatter-horus-9-65gb", price: 2000, stock: "disponibile", availableQuantity: 8, rating: 0, reviewCount: 0 },
    ]);
  });

  it("keeps every catalogue relation on a published product", () => {
    const slugs = new Set(PRODUCTS.map((product) => product.slug));

    for (const product of PRODUCTS) {
      for (const relatedSlug of product.relatedSlugs) {
        expect(slugs.has(relatedSlug), `${product.slug} -> ${relatedSlug}`).toBe(true);
      }
    }
  });
});
