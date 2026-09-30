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

  it("names a shelf only while it is short, whatever the catalogue holds today", () => {
    for (const product of PRODUCTS) {
      const named = shownShelf(product);
      if (product.availableQuantity === undefined || product.availableQuantity > SHELF_COUNT_SHOWN_UP_TO) {
        expect(named, product.slug).toBeUndefined();
      } else {
        expect(named, product.slug).toBe(product.availableQuantity);
      }
    }
  });
});
