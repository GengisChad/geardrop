import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { bestBundleOffer, bundleOffers } from "@/lib/commerce/bundle-offer";

const eur = (amount: number) => ({ amount, currency: "EUR" as const });
const line = (slug: string, price: number, quantity = 1, issue: string | null = null) => ({ slug: slug as never, quantity, unitPrice: eur(price), issue });
const bundle = (slug: string, price: number, parts: readonly string[], stock: "disponibile" | "esaurito" = "disponibile") => ({
  slug: slug as never,
  name: slug,
  price: eur(price),
  stock,
  bundleOf: parts.map((part) => ({ slug: part as never, quantity: 1 })),
});
const PRICES: Record<string, number> = { a: 1000, b: 1000, c: 1000, d: 1000 };
const priceOf = (slug: string) => PRICES[slug] ?? 0;

describe("bundleOffers", () => {
  it("offers a bundle the cart is partway into, with what the rest costs inside it", () => {
    const [offer] = bundleOffers([line("a", 1000)], [bundle("duo", 1800, ["a", "b"])], priceOf);
    expect(offer).toMatchObject({ extra: 800, missingCost: 1000, saving: 200 });
    expect(offer?.missing.map((part) => part.slug)).toEqual(["b"]);
  });

  it("offers nothing for a bundle the cart has no piece of", () => {
    expect(bundleOffers([line("c", 1000)], [bundle("duo", 1800, ["a", "b"])], priceOf)).toEqual([]);
  });

  it("measures the saving on what the cart charges, and drops a bundle that saves nothing", () => {
    // The piece is discounted in the cart: the bundle no longer beats buying the rest alone.
    expect(bundleOffers([line("a", 700)], [bundle("duo", 1800, ["a", "b"])], priceOf)).toEqual([]);
  });

  it("offers the swap when every piece is already in the cart", () => {
    const [offer] = bundleOffers([line("a", 1000), line("b", 1000)], [bundle("duo", 1800, ["a", "b"])], priceOf);
    expect(offer).toMatchObject({ missing: [], extra: -200, saving: 200 });
  });

  it("does not count a line the shop cannot deliver, nor a sold-out bundle", () => {
    expect(bundleOffers([line("a", 1000, 1, "Esaurito")], [bundle("duo", 1800, ["a", "b"])], priceOf)).toEqual([]);
    expect(bundleOffers([line("a", 1000)], [bundle("duo", 1800, ["a", "b"], "esaurito")], priceOf)).toEqual([]);
  });

  it("does not offer the rest of a bundle that is already in the cart", () => {
    expect(bundleOffers([line("a", 1000), line("duo", 1800)], [bundle("duo", 1800, ["a", "b"])], priceOf)).toEqual([]);
  });

  it("leaves out a bundle with a piece the shop cannot price", () => {
    expect(bundleOffers([line("a", 1000)], [bundle("duo", 1800, ["a", "unknown"])], priceOf)).toEqual([]);
  });
});

describe("bestBundleOffer", () => {
  it("returns nothing when there is nothing to offer", () => {
    expect(bestBundleOffer([])).toBeNull();
  });

  it("picks the bundle with the fewest pieces to add", () => {
    const offers = bundleOffers([line("a", 1000)], [bundle("pack", 3000, ["a", "b", "c", "d"]), bundle("duo", 1900, ["a", "b"])], priceOf);
    expect(offers).toHaveLength(2);
    expect(bestBundleOffer(offers)?.bundle.slug).toBe("duo");
  });

  it("puts a bundle the cart already holds in full before one that asks for more", () => {
    const offers = bundleOffers(
      [line("a", 1000), line("b", 1000)],
      [bundle("trio", 2500, ["a", "b", "c"]), bundle("duo", 1900, ["a", "b"])],
      priceOf,
    );
    expect(bestBundleOffer(offers)?.bundle.slug).toBe("duo");
  });

  it("between two bundles one piece away, picks the smaller sum to add", () => {
    const offers = bundleOffers([line("a", 1000)], [bundle("dear", 1900, ["a", "b"]), bundle("cheap", 1700, ["a", "c"])], priceOf);
    expect(bestBundleOffer(offers)?.bundle.slug).toBe("cheap");
  });

  it("shows a single offer for a piece that sits in several of the shop's bundles", () => {
    const priceBySlug = new Map(PRODUCTS.map((product) => [product.slug as string, product.price.amount]));
    const price = (slug: string) => priceBySlug.get(slug) ?? 0;
    const phoenix = PRODUCTS.find((product) => product.slug === "soar-phoenix-9-60gf")!;
    const offers = bundleOffers([line(phoenix.slug, phoenix.price.amount)], BUNDLES, price);
    expect(offers.length).toBeGreaterThan(1);
    const best = bestBundleOffer(offers)!;
    expect(best.saving).toBeGreaterThan(0);
    for (const other of offers) {
      const missing = (offer: typeof other) => offer.missing.reduce((sum, part) => sum + part.quantity, 0);
      expect(missing(best)).toBeLessThanOrEqual(missing(other));
    }
  });
});
