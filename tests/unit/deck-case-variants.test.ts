import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { VARIANT_FAMILIES } from "@/data/variant-families";
import { applyLiveStock, UNLIMITED_STOCK } from "@/lib/commerce/live-stock-overlay";
import { catalogueTraits, familyColours, familyLead, oneCardPerFamily } from "@/lib/commerce/variants";
import { productJsonLd, productTitle } from "@/lib/seo";

const deck = PRODUCTS.filter((product) => product.variant?.family === "porta-deck");
const original = PRODUCTS.find((product) => product.slug === "cobalt-drake-4-60f")!;

describe("deck case colours", () => {
  it("sells every colour of the owner's photo at €24,50, as an unofficial accessory with no stock limit", () => {
    expect(deck.map((product) => product.variant?.label)).toEqual(["Giallo", "Verde lime", "Azzurro", "Blu", "Rosa", "Fucsia", "Bianco"]);
    for (const product of deck) {
      expect(product).toMatchObject({ category: "accessori", price: { amount: 2450 }, stock: "disponibile", unofficial: true });
      expect(product.availableQuantity).toBeUndefined();
      expect(product.name).toBe(`Porta Deck ${product.variant?.label}`);
      expect(product.description).toContain("non è prodotto né certificato da Hasbro");
      expect(product.specs).toContainEqual({ label: "Produttore", value: "Non ufficiale, non prodotto da Hasbro" });
      // One picture for every colour: the case above "Scegli il tuo colore" and the swatches.
      expect(product.images.map((image) => image.src)).toEqual(["/products/porta-deck.webp"]);
    }
  });

  it("never names Hasbro as the brand of a compatible accessory, and keeps it for the originals", () => {
    expect(productTitle(deck[0]!)).toBe("Porta Deck Giallo compatibile Beyblade X");
    expect(productTitle(original)).toBe("Beyblade X Cobalt Drake 4-60F");
    expect(productJsonLd(deck[0]!)).not.toHaveProperty("brand");
    expect(productJsonLd(original)).toHaveProperty("brand", { "@type": "Brand", name: "Hasbro" });
  });

  it("lists the family once, led by its first colour, whatever order the list is in", () => {
    expect(oneCardPerFamily([deck[3]!, original, deck[0]!, deck[5]!]).map((product) => product.slug)).toEqual([
      "porta-deck-giallo",
      original.slug,
    ]);
    expect(oneCardPerFamily([deck[5]!, deck[3]!]).map((product) => product.slug)).toEqual(["porta-deck-blu"]);
  });

  it("offers every colour on each colour's page and points search engines at the first", () => {
    for (const product of deck) {
      expect(familyColours(product).map((colour) => colour.slug)).toEqual(deck.map((candidate) => candidate.slug));
      expect(familyLead(product)).toBe("porta-deck-giallo");
    }
    expect(familyColours(original)).toEqual([]);
    expect(familyLead(original)).toBe(original.slug);
  });

  it("gives the database provider what the database does not store", () => {
    const rosa = VARIANT_FAMILIES["porta-deck"]!.colours.find((colour) => colour.slug === "porta-deck-rosa")!;
    expect(catalogueTraits("porta-deck-rosa")).toEqual({
      variant: { family: "porta-deck", familyName: "Porta Deck", label: "Rosa", swatch: rosa.swatch },
      unofficial: true,
    });
    expect(catalogueTraits(original.slug)).toEqual({});
  });
});

describe("a pre-order with a fixed number of pieces", () => {
  const superion = PRODUCTS.find((product) => product.slug === "suppress-superion-0-70lp")!;
  const row = (preorder_allocation: number) => ({
    slug: superion.slug,
    stock_status: "pre-ordine" as const,
    stock_quantity: 0,
    preorder_allocation,
    availability_override: "preorder",
    allow_backorder: true,
  });

  it("is sold out once its pieces are gone, even before the database says so", () => {
    const [product] = applyLiveStock([superion], [row(0)]);
    expect(product?.stock).toBe("esaurito");
  });

  it("sells as a pre-order while pieces are left", () => {
    const [product] = applyLiveStock([superion], [row(2)]);
    expect(product).toMatchObject({ stock: "pre-ordine", availableQuantity: 2 });
  });
});

describe("unlimited stock", () => {
  const row = (stock_quantity: number) => ({
    slug: "porta-deck-giallo",
    stock_status: "disponibile" as const,
    stock_quantity,
    preorder_allocation: 0,
    availability_override: null,
    allow_backorder: true,
  });

  it("shows no count and sets no cap while the database counter is high", () => {
    const [product] = applyLiveStock([deck[0]!], [row(UNLIMITED_STOCK - 12)]);
    expect(product?.stock).toBe("disponibile");
    expect(product?.availableQuantity).toBeUndefined();
  });

  it("counts again when the owner sets a real limit in the admin", () => {
    const [product] = applyLiveStock([deck[0]!], [row(3)]);
    expect(product?.availableQuantity).toBe(3);
  });
});
