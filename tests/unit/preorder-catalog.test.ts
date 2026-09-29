import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

describe("reviewed catalogue", () => {
  it("publishes exactly the owner-supplied products, allocations and order", () => {
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
      // The 2026-09-29 arrival leads the shop, because it is the part of the catalogue that ships
      // today: eight starter packs, 26 of each, €12,90 but €16,90 for the Reaper's Kick bit.
      { slug: "sword-dran-3-60f", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "helm-knight-3-80n", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "arrow-wizard-4-80b", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "scythe-incendio-4-60t", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "courage-dran-s-6-60v", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "reaper-incendio-t-4-70k", price: 1690, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "arc-wizard-r-4-55lo", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      { slug: "dark-perseus-b-6-80w", price: 1290, stock: "disponibile", availableQuantity: 26, rating: 0, reviewCount: 0 },
      // The 2026-09-21 pre-order drop follows: nine pieces each, five left of Suppress Superion.
      { slug: "cobalt-drake-4-60f", price: 2000, stock: "pre-ordine", availableQuantity: 9, rating: 0, reviewCount: 0 },
      { slug: "mirage-clock-9-65b", price: 1950, stock: "pre-ordine", availableQuantity: 9, rating: 0, reviewCount: 0 },
      { slug: "suppress-superion-0-70lp", price: 2500, stock: "pre-ordine", availableQuantity: 5, rating: 0, reviewCount: 0 },
      { slug: "strike-dran-4-50ff", price: 2300, stock: "pre-ordine", availableQuantity: 9, rating: 0, reviewCount: 0 },
      { slug: "tread-croc-tq-5-50gn", price: 2500, stock: "pre-ordine", availableQuantity: 9, rating: 0, reviewCount: 0 },
      // The Infinity Starters follow, then the rest of the catalogue.
      { slug: "glory-valkerion-lf", price: 3000, stock: "pre-ordine", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "hurricane-enlil-is-7-55t", price: 1800, stock: "disponibile", availableQuantity: 10, rating: 0, reviewCount: 0 },
      { slug: "shatter-horus-9-65gb", price: 1800, stock: "disponibile", availableQuantity: 8, rating: 0, reviewCount: 0 },
      { slug: "cobalt-dragoon-2-60c", price: 2550, stock: "pre-ordine", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "soar-phoenix-9-60gf", price: 3200, stock: "pre-ordine", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      // The shipment from Spain landed on 2026-09-29: these four are on the shelf, at the prices
      // that undercut every Italian shop still holding them.
      { slug: "saber-samurai-2-70l", price: 2590, stock: "disponibile", availableQuantity: 16, rating: 0, reviewCount: 0 },
      { slug: "blast-pegasus-a-tr", price: 2690, stock: "disponibile", availableQuantity: 56, rating: 0, reviewCount: 0 },
      { slug: "drop-attack-battle-set", price: 3990, stock: "disponibile", availableQuantity: 102, rating: 0, reviewCount: 0 },
      { slug: "sneak-attack-battle-set", price: 4490, stock: "disponibile", availableQuantity: 51, rating: 0, reviewCount: 0 },
      // The deck case: one product per colour, €24,50, no stock limit (2026-09-21).
      { slug: "porta-deck-giallo", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-verde-lime", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-azzurro", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-blu", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-rosa", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-fucsia", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
      { slug: "porta-deck-bianco", price: 2450, stock: "disponibile", availableQuantity: undefined, rating: 0, reviewCount: 0 },
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
