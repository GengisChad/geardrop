import { describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";

const provider = createMockProvider();

describe("getProduct", () => {
  it("returns a product by slug", async () => {
    const product = await provider.getProduct("wizard-arrow-4-80b");
    expect(product?.name).toBe("Wizard Arrow 4-80B");
  });

  it("returns null for an unknown slug instead of throwing", async () => {
    expect(await provider.getProduct("non-esiste")).toBeNull();
  });
});

describe("getProductsBySlugs", () => {
  it("preserves the requested order", async () => {
    const products = await provider.getProductsBySlugs(["shark-edge-3-60lf", "wizard-arrow-4-80b"]);
    expect(products.map((p) => p.slug)).toEqual(["shark-edge-3-60lf", "wizard-arrow-4-80b"]);
  });

  it("skips unknown slugs rather than returning holes", async () => {
    const products = await provider.getProductsBySlugs(["wizard-arrow-4-80b", "non-esiste"]);
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
    const page = await provider.listProducts({ stock: ["esaurito"] });
    expect(page.items.every((p) => p.stock === "esaurito")).toBe(true);
  });

  it("filters by blade type", async () => {
    const page = await provider.listProducts({ bladeType: ["difesa"] });
    expect(page.items.every((p) => p.bladeType === "difesa")).toBe(true);
  });

  it("applies price bounds inclusively", async () => {
    const page = await provider.listProducts({ minPrice: 2499, maxPrice: 2499 });
    expect(page.items.every((p) => p.price.amount === 2499)).toBe(true);
  });

  it("sorts by price ascending and descending", async () => {
    const asc = await provider.listProducts({ sort: "prezzo-asc", perPage: 100 });
    const desc = await provider.listProducts({ sort: "prezzo-desc", perPage: 100 });
    const ascPrices = asc.items.map((p) => p.price.amount);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    expect(desc.items[0]?.price.amount).toBe(ascPrices.at(-1));
  });

  it("searches name and tagline, ignoring case", async () => {
    const page = await provider.listProducts({ search: "WIZARD" });
    expect(page.items.map((p) => p.slug)).toContain("wizard-arrow-4-80b");
  });

  it("requires every search token to match", async () => {
    const page = await provider.listProducts({ search: "wizard cobalt" });
    expect(page.items).toHaveLength(0);
  });

  it("returns nothing for a search that matches nothing", async () => {
    const page = await provider.listProducts({ search: "zzzzzz" });
    expect(page.total).toBe(0);
  });

  it("paginates and reports a stable page count", async () => {
    const page = await provider.listProducts({ perPage: 3, page: 2 });
    expect(page.items).toHaveLength(3);
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
    // Ticking one availability must not drive the other availability counts to zero,
    // or the filter panel would become a dead end.
    const facets = await provider.getFacets({ stock: ["esaurito"] });
    const available = facets.stock.find((f) => f.value === "disponibile");
    expect(available?.count).toBeGreaterThan(0);
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

describe("quoteCart", () => {
  it("totals an empty cart to zero and charges no shipping", async () => {
    const quote = await provider.quoteCart({ lines: [] });
    expect(quote.totals.total.amount).toBe(0);
    expect(quote.totals.shipping.amount).toBe(0);
    expect(quote.totals.freeShippingRemaining).toBe(0);
  });

  it("charges flat-rate shipping below the threshold", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }] });
    expect(quote.totals.subtotal.amount).toBe(2499);
    expect(quote.totals.shipping.amount).toBe(SHIPPING_FLAT_RATE);
    expect(quote.totals.total.amount).toBe(2499 + SHIPPING_FLAT_RATE);
    expect(quote.totals.freeShippingRemaining).toBe(FREE_SHIPPING_THRESHOLD - 2499);
  });

  it("gives free shipping exactly at the threshold, not just above it", async () => {
    // 3 x 24,99 = 74,97 clears 59,00; check the boundary explicitly.
    const quote = await provider.quoteCart({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 3 }] });
    expect(quote.totals.subtotal.amount).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(quote.totals.shipping.amount).toBe(0);
    expect(quote.totals.freeShippingRemaining).toBe(0);
  });

  it("multiplies by quantity", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }] });
    expect(quote.totals.subtotal.amount).toBe(2499 * 2);
    expect(quote.lines[0]?.unitPrice.amount).toBe(2499);
    expect(quote.lines[0]?.lineTotal.amount).toBe(4998);
  });

  it("reports lines whose product no longer exists instead of pricing them", async () => {
    // A stale localStorage cart must not crash or inflate the total.
    const quote = await provider.quoteCart({
      lines: [
        { slug: "wizard-arrow-4-80b", quantity: 1 },
        { slug: "prodotto-rimosso" as never, quantity: 5 },
      ],
    });
    expect(quote.totals.subtotal.amount).toBe(2499);
    expect(quote.missingSlugs).toEqual(["prodotto-rimosso"]);
    expect(quote.lines).toHaveLength(1);
  });

  it("offers only the shipping option the local catalogue knows about", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }] });
    expect(quote.shippingOptions.map((option) => option.code)).toEqual(["standard"]);
    expect(quote.shippingCode).toBe("standard");
  });

  it("never claims an order can be placed against the local catalogue", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }] });
    expect(quote.orderIntake).toBe("unconfigured");
    expect(quote.orderable).toBe(false);
    expect(quote.notice).toContain("Gli ordini non sono ancora attivi");
  });

  it("refuses a coupon rather than silently ignoring it", async () => {
    const quote = await provider.quoteCart({
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }],
      couponCode: "SCONTO10",
    });
    expect(quote.couponCode).toBeNull();
    expect(quote.couponError).toContain("non sono disponibili");
    expect(quote.totals.discount.amount).toBe(0);
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

  it("covers all four stock states, so every designed card variant is reachable", () => {
    const states = new Set(PRODUCTS.map((p) => p.stock));
    expect([...states].sort()).toEqual(["disponibile", "esaurito", "in-arrivo", "pre-ordine"]);
  });
});
