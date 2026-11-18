/**
 * The arrival of 2026-11-18 (owner): six Luster Dragoon at 39,99, two Silver Wolf at 34,99 and one
 * BX-53 All-in-One Set priced against the other shops; and packs that reach the free shipping with
 * the meta pieces while they move the Enlil ("magari 42 euro luster + enlil").
 */
import { describe, expect, it } from "vitest";
import { BULKY_SHIPPING_METHOD, BUNDLES, FREE_SHIPPING_THRESHOLD, PRODUCTS, brandLabel, brandOf, fitsLocker, shippingBrandOf } from "@/data/catalog";
import { withBundles } from "@/lib/commerce/bundles";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { SPOTLIGHT_SLUGS } from "@/lib/home/product-selection";

const OWNER_LIST: Readonly<Record<string, { readonly price: number; readonly stock: number }>> = {
  "bx-52-luster-dragoon-6-60lc": { price: 3999, stock: 6 },
  "ux-08-silver-wolf-3-80fb": { price: 3499, stock: 2 },
  "bx-53-all-in-one-set": { price: 15990, stock: 1 },
};

const product = (slug: string) => PRODUCTS.find((candidate) => candidate.slug === slug)!;
const bundle = (slug: string) => BUNDLES.find((candidate) => candidate.slug === slug)!;
const spec = (slug: string, label: string) => product(slug).specs.find((entry) => entry.label === label)?.value;
const provider = createMockProvider(withBundles(PRODUCTS, BUNDLES));

describe("the three Takara Tomy pieces", () => {
  it("sell at the owner's prices, from the shop's own shelf, under Takara Tomy", () => {
    for (const [slug, listed] of Object.entries(OWNER_LIST)) {
      const piece = product(slug);
      expect(piece.price.amount, slug).toBe(listed.price);
      expect(piece.availableQuantity, slug).toBe(listed.stock);
      expect(piece.stock, slug).toBe("disponibile");
      expect(brandOf(piece), slug).toBe("takara-tomy");
      // Bought by the shop, not the partner's: they leave from our warehouse.
      expect(piece.consignment, slug).toBeUndefined();
      expect(shippingBrandOf(piece), slug).toBe("hasbro");
      expect(piece.tags, slug).toContain("novita");
    }
  });

  it("say that Luster Dragoon spins left and comes with its own L launcher", () => {
    expect(spec("bx-52-luster-dragoon-6-60lc", "Rotazione")).toMatch(/^Sinistra/);
    expect(spec("bx-52-luster-dragoon-6-60lc", "Lanciatore")).toMatch(/Winder Launcher L .*incluso/);
    expect(product("bx-52-luster-dragoon-6-60lc").boxContents).toContain("1 × Winder Launcher L viola");
  });

  it("send the BX-53 to the door with Poste: its stadium box fits no Locker", async () => {
    expect(fitsLocker(product("bx-53-all-in-one-set"))).toBe(false);
    const quote = await provider.quoteCart({ lines: [{ slug: "bx-53-all-in-one-set", quantity: 1 }] });
    expect(quote.lines[0]?.issue).toBeNull();
    // 159,90 clears the free shipping on its own.
    expect(quote.totals.shipping.amount).toBe(0);
    expect(quote.shippingOptions.map((option) => option.code)).toEqual([BULKY_SHIPPING_METHOD.code]);
    expect(quote.shippingOptions[0]?.lockReasons).toContain("bulky");
  });

  it("lead the homepage spotlight, ahead of the arrival of 2026-11-06", () => {
    expect(SPOTLIGHT_SLUGS.slice(0, 3)).toEqual(Object.keys(OWNER_LIST));
  });
});

describe("the packs of 2026-11-18", () => {
  it("put Luster Dragoon and Hurricane Enlil together at 42,00", () => {
    const duo = bundle("duo-luster-enlil");
    expect(duo.price.amount).toBe(4200);
    expect(duo.bundleOf).toEqual([
      { slug: "bx-52-luster-dragoon-6-60lc", quantity: 1 },
      { slug: "hurricane-enlil-is-7-55t", quantity: 1 },
    ]);
  });

  it("reach the free shipping on their own, with the meta pieces and the Enlil in each", async () => {
    for (const slug of ["pack-meta-luster", "pack-meta-phoenix"]) {
      const pack = bundle(slug);
      expect(pack.price.amount, slug).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
      const pieces = (pack.bundleOf ?? []).map((part) => part.slug);
      expect(pieces, slug).toEqual(expect.arrayContaining(["soar-phoenix-9-60gf", "glory-valkerion-lf", "hurricane-enlil-is-7-55t"]));
      const quote = await provider.quoteCart({ lines: [{ slug, quantity: 1 }] });
      expect(quote.lines[0]?.issue, slug).toBeNull();
      expect(quote.totals.shipping.amount, slug).toBe(0);
      expect(quote.totals.freeShippingRemaining, slug).toBe(0);
    }
    expect(bundle("pack-meta-luster").bundleOf?.map((part) => part.slug)).toContain("bx-52-luster-dragoon-6-60lc");
  });

  it("name both makers above the title when they mix the two lines", () => {
    expect(brandLabel(bundle("duo-luster-enlil"))).toBe("Takara Tomy e Hasbro");
    expect(brandLabel(bundle("pack-meta-luster"))).toBe("Takara Tomy e Hasbro");
    expect(brandLabel(bundle("pack-meta-phoenix"))).toBe("Hasbro e Takara Tomy");
    expect(brandLabel(bundle("duo-horus-enlil"))).toBe("Hasbro");
    expect(brandLabel(product("bx-52-luster-dragoon-6-60lc"))).toBe("Takara Tomy");
  });

  it("never sell more Luster packs than there are Luster Dragoon", () => {
    const luster = product("bx-52-luster-dragoon-6-60lc").availableQuantity!;
    for (const slug of ["duo-luster-enlil", "pack-meta-luster"]) {
      expect(bundle(slug).availableQuantity, slug).toBeLessThanOrEqual(luster);
    }
  });
});
