import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { SHELF_COUNT_SHOWN_UP_TO, shownShelf } from "@/lib/labels";

describe("the shelf the product page names", () => {
  it("names a short shelf, because that is scarcity", () => {
    expect(shownShelf({ availableQuantity: 1 })).toBe(1);
    expect(shownShelf({ availableQuantity: SHELF_COUNT_SHOWN_UP_TO })).toBe(SHELF_COUNT_SHOWN_UP_TO);
  });

  it("says nothing about a deep shelf: the status badge already carries it", () => {
    expect(shownShelf({ availableQuantity: SHELF_COUNT_SHOWN_UP_TO + 1 })).toBeUndefined();
    expect(shownShelf({ availableQuantity: 102 })).toBeUndefined();
  });

  it("stays quiet on a product with no count at all", () => {
    expect(shownShelf({})).toBeUndefined();
    expect(shownShelf({ availableQuantity: 0 })).toBe(0);
  });

  it("keeps the 2026-09-29 arrival off the scarcity line and the small shelves on it", () => {
    const shelf = (slug: string) => shownShelf(PRODUCTS.find((product) => product.slug === slug) ?? {});

    expect(shelf("drop-attack-battle-set")).toBeUndefined();
    expect(shelf("sneak-attack-battle-set")).toBeUndefined();
    expect(shelf("blast-pegasus-a-tr")).toBeUndefined();
    // Sixteen Saber Samurai is still a warehouse, not a last-pieces warning.
    expect(shelf("saber-samurai-2-70l")).toBeUndefined();
    expect(shelf("shatter-horus-9-65gb")).toBe(8);
    expect(shelf("hurricane-enlil-is-7-55t")).toBe(10);
  });
});
