import { describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";

const provider = createMockProvider();

describe("getProduct", () => {
  it("returns a product by slug", async () => {
    const product = await provider.getProduct("cobalt-dragoon-2-60c");
    expect(product?.name).toBe("Cobalt Dragoon 2-60C");
  });

  it("returns null for an unknown slug instead of throwing", async () => {
    expect(await provider.getProduct("non-esiste")).toBeNull();
  });
});

describe("getProductsBySlugs", () => {
  it("preserves the requested order", async () => {
    const products = await provider.getProductsBySlugs(["soar-phoenix-9-60gf", "cobalt-dragoon-2-60c"]);
    expect(products.map((p) => p.slug)).toEqual(["soar-phoenix-9-60gf", "cobalt-dragoon-2-60c"]);
  });

  it("skips unknown slugs rather than returning holes", async () => {
    const products = await provider.getProductsBySlugs(["cobalt-dragoon-2-60c", "non-esiste"]);
    expect(products).toHaveLength(1);
  });
});

describe("listProducts", () => {
  it("filters by category", async () => {
    const page = await provider.listProducts({ category: "stadi" });
    expect(page.items.every((p) => p.category === "stadi")).toBe(true);
    expect(page.total).toBeGreaterThan(0);
  });

  it("filters by stock status", async () => {
    const page = await provider.listProducts({ stock: ["pre-ordine"] });
    expect(page.items.every((p) => p.stock === "pre-ordine")).toBe(true);
    expect(page.total).toBeGreaterThan(0);
  });

  it("filters by blade type", async () => {
    const page = await provider.listProducts({ bladeType: ["attacco"] });
    expect(page.items.every((p) => p.bladeType === "attacco")).toBe(true);
    expect(page.total).toBeGreaterThan(0);
  });

  it("applies price bounds inclusively", async () => {
    const page = await provider.listProducts({ minPrice: 2550, maxPrice: 2550 });
    expect(page.items.every((p) => p.price.amount === 2550)).toBe(true);
    expect(page.items.map((p) => p.slug)).toContain("cobalt-dragoon-2-60c");
  });

  it("sorts by price ascending and descending", async () => {
    const asc = await provider.listProducts({ sort: "prezzo-asc", perPage: 100 });
    const desc = await provider.listProducts({ sort: "prezzo-desc", perPage: 100 });
    const ascPrices = asc.items.map((p) => p.price.amount);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    expect(desc.items[0]?.price.amount).toBe(ascPrices.at(-1));
  });

  it("searches name and tagline, ignoring case", async () => {
    const page = await provider.listProducts({ search: "COBALT" });
    expect(page.items.map((p) => p.slug)).toContain("cobalt-dragoon-2-60c");
  });

  it("requires every search token to match", async () => {
    const page = await provider.listProducts({ search: "cobalt phoenix" });
    expect(page.items).toHaveLength(0);
  });

  it("returns nothing for a search that matches nothing", async () => {
    const page = await provider.listProducts({ search: "zzzzzz" });
    expect(page.total).toBe(0);
  });

  it("paginates and reports a stable page count", async () => {
    const page = await provider.listProducts({ perPage: 3, page: 2 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(Math.ceil(PRODUCTS.length / 3));
  });

  it("clamps an out-of-range page instead of returning an empty list", async () => {
    const page = await provider.listProducts({ perPage: 3, page: 999 });
    expect(page.page).toBe(page.pageCount);
    expect(page.items.length).toBeGreaterThan(0);
  });
});

describe("getFacets", () => {
  it("counts each facet against the query with that facet removed", async () => {
    // Filtering by one category must not zero the availability counts, or the panel dies.
    const facets = await provider.getFacets({ category: "stadi" });
    const preorder = facets.stock.find((f) => f.value === "pre-ordine");
    expect(preorder?.count).toBeGreaterThan(0);
  });

  it("narrows sibling facets by the other active filters", async () => {
    const facets = await provider.getFacets({ category: "stadi" });
    const attacco = facets.bladeType.find((f) => f.value === "attacco");
    expect(attacco?.count).toBe(0); // arena kits have no blade type
  });

  it("reports total matching the active query", async () => {
    const facets = await provider.getFacets({ category: "beyblade-x" });
    const page = await provider.listProducts({ category: "beyblade-x", perPage: 100 });
    expect(facets.total).toBe(page.total);
  });

  it("exposes the real price range", async () => {
    const facets = await provider.getFacets();
    expect(facets.priceRange.min).toBe(Math.min(...PRODUCTS.map((p) => p.price.amount)));
    expect(facets.priceRange.max).toBe(Math.max(...PRODUCTS.map((p) => p.price.amount)));
  });
});

describe("computeTotals", () => {
  it("totals an empty cart to zero and charges no shipping", async () => {
    const totals = await provider.computeTotals([]);
    expect(totals.total.amount).toBe(0);
    expect(totals.shipping.amount).toBe(0);
    expect(totals.freeShippingRemaining).toBe(0);
  });

  it("charges flat-rate shipping below the threshold", async () => {
    const totals = await provider.computeTotals([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);
    expect(totals.subtotal.amount).toBe(2550);
    expect(totals.shipping.amount).toBe(SHIPPING_FLAT_RATE);
    expect(totals.total.amount).toBe(2550 + SHIPPING_FLAT_RATE);
    expect(totals.freeShippingRemaining).toBe(FREE_SHIPPING_THRESHOLD - 2550);
  });

  it("gives free shipping once the threshold is cleared", async () => {
    // 3 x 25,50 = 76,50 clears 59,00.
    const totals = await provider.computeTotals([{ slug: "cobalt-dragoon-2-60c", quantity: 3 }]);
    expect(totals.subtotal.amount).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(totals.shipping.amount).toBe(0);
    expect(totals.freeShippingRemaining).toBe(0);
  });

  it("multiplies by quantity", async () => {
    const totals = await provider.computeTotals([{ slug: "cobalt-dragoon-2-60c", quantity: 2 }]);
    expect(totals.subtotal.amount).toBe(2550 * 2);
  });

  it("ignores lines whose product no longer exists", async () => {
    // A stale localStorage cart must not crash or inflate the total.
    const totals = await provider.computeTotals([
      { slug: "cobalt-dragoon-2-60c", quantity: 1 },
      { slug: "prodotto-rimosso" as never, quantity: 5 },
    ]);
    expect(totals.subtotal.amount).toBe(2550);
  });
});

describe("catalogue integrity", () => {
  it("has no duplicate slugs", () => {
    const slugs = PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every product at least one image", () => {
    expect(PRODUCTS.every((p) => p.images.length > 0)).toBe(true);
  });

  it("gives every product a non-negative on-hand quantity", () => {
    expect(PRODUCTS.every((p) => p.stockQuantity === undefined || p.stockQuantity >= 0)).toBe(true);
  });

  it("only points related products at slugs that exist", () => {
    const slugs = new Set<string>(PRODUCTS.map((p) => p.slug));
    for (const product of PRODUCTS) {
      for (const related of product.relatedSlugs) {
        expect(slugs.has(related), `${product.slug} -> ${related}`).toBe(true);
      }
    }
  });

  it("never relates a product to itself", () => {
    for (const product of PRODUCTS) {
      expect(product.relatedSlugs).not.toContain(product.slug);
    }
  });

  it("uses only valid stock states", () => {
    const valid = new Set(["disponibile", "in-arrivo", "pre-ordine", "esaurito"]);
    expect(PRODUCTS.every((p) => valid.has(p.stock))).toBe(true);
  });
});
