import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import { isNewsPayload, referencePrice, scanMeta, scanProducts, type ProductMemory } from "@/lib/telegram/news";

const find = (slug: string): Product => {
  const product = [...PRODUCTS, ...BUNDLES].find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`fixture ${slug} left the catalogue`);
  return product;
};
const priced = (product: Product, amount: number): Product => ({ ...product, price: { amount, currency: "EUR" } });
const stocked = (product: Product, stock: Product["stock"]): Product => ({ ...product, stock });

const NOW = new Date("2026-11-26T09:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const phoenix = stocked(priced(find("soar-phoenix-9-60gf-solo-trottola"), 1690), "disponibile");
const yellow = stocked(find("porta-deck-giallo"), "disponibile");
const lime = stocked(find("porta-deck-verde-lime"), "disponibile");

/** The memory a first look leaves behind, to start every other case from. */
function remember(products: readonly Product[], at = daysAgo(60)): Map<string, ProductMemory> {
  return new Map(scanProducts(new Map(), products, new Date(at), true).memory);
}

describe("the first look at the shop", () => {
  it("remembers everything on sale and announces nothing", () => {
    const scan = scanProducts(new Map(), [phoenix, stocked(yellow, "esaurito")], NOW, true);
    expect(scan.events).toEqual([]);
    expect(scan.memory.get(phoenix.slug)).toEqual({ stock: "disponibile", prices: [{ amount: 1690, since: NOW.toISOString() }] });
    // A piece sold out on day one is a return when it comes back, not an arrival.
    expect(scan.memory.get(yellow.slug)?.unannounced).toBeUndefined();
  });
});

describe("new arrivals", () => {
  it("announces a product the shop did not have at the last look", () => {
    const scan = scanProducts(remember([yellow]), [yellow, phoenix], NOW);
    expect(scan.events).toEqual([{ eventKey: `new:${phoenix.slug}`, payload: { kind: "new_product", slugs: [phoenix.slug] } }]);
    expect(scan.memory.has(phoenix.slug)).toBe(true);
    expect(scan.memory.has(yellow.slug)).toBe(false);
  });

  it("waits for the first day on the shelf when a product enters the catalogue sold out", () => {
    const entered = scanProducts(remember([yellow]), [yellow, stocked(phoenix, "esaurito")], NOW);
    expect(entered.events).toEqual([]);
    expect(entered.memory.get(phoenix.slug)?.unannounced).toBe(true);

    const memory = new Map([...remember([yellow]), ...entered.memory]);
    const arrived = scanProducts(memory, [yellow, phoenix], NOW);
    expect(arrived.events.map((event) => event.payload.kind)).toEqual(["new_product"]);
    expect(arrived.memory.get(phoenix.slug)?.unannounced).toBeUndefined();
  });

  it("announces the colours of one item once, together", () => {
    const scan = scanProducts(remember([phoenix]), [phoenix, yellow, lime], NOW);
    expect(scan.events).toEqual([{ eventKey: "new:porta-deck", payload: { kind: "new_product", slugs: [yellow.slug, lime.slug] } }]);
  });

  it("says nothing the second time it sees the same shop", () => {
    const first = scanProducts(remember([yellow]), [yellow, phoenix], NOW);
    const second = scanProducts(new Map([...remember([yellow]), ...first.memory]), [yellow, phoenix], NOW);
    expect(second.events).toEqual([]);
    expect(second.memory.size).toBe(0);
  });
});

describe("back in stock", () => {
  it("announces a sold-out piece that sells again", () => {
    const scan = scanProducts(remember([stocked(phoenix, "esaurito")]), [phoenix], NOW);
    expect(scan.events).toEqual([{ eventKey: `stock:${phoenix.slug}:2026-11-26`, payload: { kind: "back_in_stock", slugs: [phoenix.slug] } }]);
    expect(scan.memory.get(phoenix.slug)?.stock).toBe("disponibile");
  });

  it("counts a reopened pre-order as a return too", () => {
    const scan = scanProducts(remember([stocked(phoenix, "esaurito")]), [stocked(phoenix, "pre-ordine")], NOW);
    expect(scan.events.map((event) => event.payload.kind)).toEqual(["back_in_stock"]);
  });

  it("announces the piece that came back, not every kit that holds it", () => {
    const kit = find("deck-da-torneo");
    const before = remember([stocked(phoenix, "esaurito"), stocked(kit, "esaurito")]);
    const scan = scanProducts(before, [phoenix, stocked(kit, "disponibile")], NOW);
    expect(scan.events.map((event) => event.payload)).toEqual([{ kind: "back_in_stock", slugs: [phoenix.slug] }]);
    expect(scan.memory.get(kit.slug)?.stock).toBe("disponibile");
  });

  it("does not announce a piece that sells out", () => {
    const scan = scanProducts(remember([phoenix]), [stocked(phoenix, "esaurito")], NOW);
    expect(scan.events).toEqual([]);
    expect(scan.memory.get(phoenix.slug)?.stock).toBe("esaurito");
  });
});

describe("lower prices", () => {
  it("announces a price below the one of the last 30 days, and quotes that one", () => {
    const scan = scanProducts(remember([priced(phoenix, 2190)]), [phoenix], NOW);
    expect(scan.events).toEqual([
      { eventKey: `price:${phoenix.slug}:1690:2026-11-26`, payload: { kind: "price_drop", slugs: [phoenix.slug], price: 1690, previousPrice: 2190 } },
    ]);
  });

  it("does not call it a reduction when the price only comes back down after a rise", () => {
    // 16,90 until ten days ago, then 21,90, now 18,90: the lowest of the last 30 days is 16,90.
    const memory = new Map<string, ProductMemory>([
      [phoenix.slug, { stock: "disponibile", prices: [{ amount: 1690, since: daysAgo(90) }, { amount: 2190, since: daysAgo(10) }] }],
    ]);
    const scan = scanProducts(memory, [priced(phoenix, 1890)], NOW);
    expect(scan.events).toEqual([]);
    expect(scan.memory.get(phoenix.slug)?.prices.at(-1)?.amount).toBe(1890);
  });

  it("measures a reduction against the lowest price of those 30 days, not the last one", () => {
    const memory = new Map<string, ProductMemory>([
      [phoenix.slug, { stock: "disponibile", prices: [{ amount: 1990, since: daysAgo(90) }, { amount: 2190, since: daysAgo(10) }] }],
    ]);
    const scan = scanProducts(memory, [priced(phoenix, 1690)], NOW);
    expect(scan.events[0]?.payload).toMatchObject({ kind: "price_drop", price: 1690, previousPrice: 1990 });
  });

  it("forgets a price that stopped being charged more than 30 days ago", () => {
    const prices = [{ amount: 1500, since: daysAgo(120) }, { amount: 2190, since: daysAgo(40) }];
    expect(referencePrice(prices, NOW)).toBe(2190);
    expect(referencePrice([{ amount: 1500, since: daysAgo(120) }, { amount: 2190, since: daysAgo(20) }], NOW)).toBe(1500);
  });

  it("says nothing about a higher price, or a lower one on a sold-out piece", () => {
    expect(scanProducts(remember([phoenix]), [priced(phoenix, 2190)], NOW).events).toEqual([]);
    expect(scanProducts(remember([stocked(priced(phoenix, 2190), "esaurito")]), [stocked(phoenix, "esaurito")], NOW).events).toEqual([]);
  });

  it("announces a restock at a lower price as a restock only", () => {
    const scan = scanProducts(remember([stocked(priced(phoenix, 2190), "esaurito")]), [phoenix], NOW);
    expect(scan.events.map((event) => event.payload.kind)).toEqual(["back_in_stock"]);
  });
});

describe("tier lists", () => {
  it("remembers the published months on the first look", () => {
    expect(scanMeta(new Set(), ["2026-10", "2026-11"], true)).toEqual({ events: [], seen: ["2026-10", "2026-11"] });
  });

  it("announces a new month once", () => {
    const scan = scanMeta(new Set(["2026-10", "2026-11"]), ["2026-10", "2026-11", "2026-12"]);
    expect(scan.events).toEqual([{ eventKey: "meta:2026-12", payload: { kind: "meta_update", month: "2026-12" } }]);
    expect(scanMeta(new Set(["2026-10", "2026-11", "2026-12"]), ["2026-10", "2026-11", "2026-12"]).events).toEqual([]);
  });

  it("does not announce an old month added to the archive", () => {
    const scan = scanMeta(new Set(["2026-11"]), ["2026-09", "2026-11"]);
    expect(scan.events).toEqual([]);
    expect(scan.seen).toEqual(["2026-09"]);
  });
});

describe("draft payloads read back from the database", () => {
  it("accepts the shop's kinds and nothing else", () => {
    expect(isNewsPayload({ kind: "new_product", slugs: ["a"] })).toBe(true);
    expect(isNewsPayload({ kind: "price_drop", slugs: ["a"], price: 1690, previousPrice: 2190 })).toBe(true);
    expect(isNewsPayload({ kind: "meta_update", month: "2026-11" })).toBe(true);
    expect(isNewsPayload({ kind: "price_drop", slugs: ["a"] })).toBe(false);
    expect(isNewsPayload({ kind: "back_in_stock", slugs: [] })).toBe(false);
    expect(isNewsPayload({ kind: "new_order", slugs: ["a"] })).toBe(false);
    // The owner's YouTube uploads are not the shop's news: a video draft left in the table is not read back.
    expect(isNewsPayload({ kind: "new_video", videoId: "x", title: "t", url: "https://www.youtube.com/watch?v=x" })).toBe(false);
    expect(isNewsPayload(null)).toBe(false);
  });
});
