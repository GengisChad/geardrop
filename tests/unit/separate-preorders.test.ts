import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { applyLiveStock } from "@/lib/commerce/live-stock-overlay";
import { PREORDER_ALONE_ISSUE, separatePreorders } from "@/lib/commerce/separate-preorders";

/**
 * Owner, 2026-10-08: a pre-order never shares an order with pieces that ship now (two parcels
 * to one buyer), and a product whose shelf is empty is sold out with "Avvisami", never an
 * open pre-order.
 */
describe("a pre-order is ordered on its own", () => {
  const provider = createMockProvider(PRODUCTS);

  it("blocks a release pre-order next to a product that ships now", async () => {
    const quote = await provider.quoteCart({
      lines: [
        { slug: "soar-phoenix-9-60gf", quantity: 1 },
        { slug: "tread-croc-tq-5-50gn", quantity: 1 },
      ],
    });
    expect(quote.lines.map((line) => line.issue)).toEqual([null, PREORDER_ALONE_ISSUE]);
    expect(quote.orderable).toBe(false);
  });

  it("lets pre-orders go together, and products that ship now go together", async () => {
    const preorders = await provider.quoteCart({
      lines: [
        { slug: "tread-croc-tq-5-50gn", quantity: 1 },
        { slug: "cobalt-drake-4-60f", quantity: 1 },
      ],
    });
    expect(preorders.lines.every((line) => line.issue === null)).toBe(true);

    const ready = await provider.quoteCart({
      lines: [
        { slug: "soar-phoenix-9-60gf", quantity: 1 },
        { slug: "glory-valkerion-lf", quantity: 1 },
      ],
    });
    expect(ready.lines.every((line) => line.issue === null)).toBe(true);
  });

  it("leaves a line that already has a problem alone", () => {
    const lines = separatePreorders([
      { stock: "disponibile" as const, issue: null },
      { stock: "pre-ordine" as const, issue: "Non disponibile" },
    ]);
    expect(lines.map((line) => line.issue)).toEqual([null, "Non disponibile"]);
  });
});

describe("an empty shelf is sold out", () => {
  it("reads 'esaurito', not 'pre-ordine', once allow_backorder is off", () => {
    const [wand] = applyLiveStock(
      PRODUCTS.filter((product) => product.slug === "wand-wizard-1-60r"),
      [{ slug: "wand-wizard-1-60r", stock_status: "esaurito", stock_quantity: 0, preorder_allocation: 0, availability_override: null, allow_backorder: false }],
    );
    expect(wand!.stock).toBe("esaurito");
    expect(wand!.autoPreorder).toBeUndefined();
  });
});
