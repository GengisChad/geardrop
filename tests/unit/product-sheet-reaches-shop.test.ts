import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { applyLiveStock, type LiveStockRow } from "@/lib/commerce/live-stock-overlay";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import {
  applyStorefrontContent,
  changedContentFields,
  mergeStorefrontFields,
  type StorefrontContentRow,
} from "@/lib/commerce/storefront-content";
import type { CartQuoteRequest, Product } from "@/lib/commerce/types";

// Owner, 2026-11-24: "se da scheda prodotto cambio nome, sku o simile la pagina effettivamente non si
// aggiorna con il prodotto nuovo. Cambia solo il prezzo".

const SLUG = "long-winder-launcher-takara-tomy";
const catalogued = PRODUCTS.find((product) => product.slug === SLUG)!;

function row(fields: readonly string[], overrides: Partial<StorefrontContentRow> = {}): StorefrontContentRow {
  return {
    slug: SLUG,
    storefront_fields: fields,
    name: "Long Winder Launcher Evangelion",
    tagline: "Solo la stampa NERV.",
    description: "Il lanciatore con la Long Winder, nella stampa NERV.",
    blade_type: null,
    category: { slug: "accessori" },
    specs: [{ label: "Winder", value: "Long Winder", sort_order: 1 }, { label: "Produttore", value: "Takara Tomy", sort_order: 0 }],
    features: [{ title: "Stampa NERV", description: "Nera con la winder rossa", sort_order: 0 }],
    box_contents: [{ content: "1 × Lanciatore", sort_order: 0 }],
    images: [
      { src: "/products/long-winder-launcher-takara-tomy.webp", width: 1000, height: 1000, alt: "Seconda", sort_order: 0, published: true, is_primary: false },
      { src: "/products/string-launcher-takara-tomy.webp", width: 1000, height: 1000, alt: "Copertina", sort_order: 1, published: true, is_primary: true },
      { src: "/products/nascosta.webp", width: 1000, height: 1000, alt: "Non pubblicata", sort_order: 2, published: false, is_primary: false },
      { src: "org/1/caricata.webp", width: 1000, height: 1000, alt: "Dalla libreria media", sort_order: 3, published: true, is_primary: false },
    ],
    tags: [{ tag: "offerta" }, { tag: "sconosciuto" }],
    ...overrides,
  };
}

const apply = (content: StorefrontContentRow) => applyStorefrontContent([catalogued], [content])[0]!;

describe("the copy changed on the product sheet", () => {
  it("reaches the shop for the fields the sheet changed, and only those", () => {
    const product = apply(row(["name", "description"]));
    expect(product.name).toBe("Long Winder Launcher Evangelion");
    expect(product.description).toBe("Il lanciatore con la Long Winder, nella stampa NERV.");
    // Untouched on the sheet: the catalogue's copy stays, even if the row holds something else.
    expect(product.tagline).toBe(catalogued.tagline);
    expect(product.category).toBe(catalogued.category);
    expect(product.specs).toEqual(catalogued.specs);
    expect(product.images).toEqual(catalogued.images);
    expect(product.price).toEqual(catalogued.price);
  });

  it("leaves a product nobody changed exactly as catalogued", () => {
    expect(apply(row([]))).toBe(catalogued);
    expect(applyStorefrontContent(PRODUCTS, [])).toBe(PRODUCTS);
    expect(apply(row(["sku", "slug"]))).toBe(catalogued);
  });

  it("takes the lists in the sheet's order, and the tags the shop knows", () => {
    const product = apply(row(["specs", "features", "box_contents", "tags", "category", "tagline"]));
    expect(product.specs).toEqual([{ label: "Produttore", value: "Takara Tomy" }, { label: "Winder", value: "Long Winder" }]);
    expect(product.features).toEqual([{ title: "Stampa NERV", description: "Nera con la winder rossa" }]);
    expect(product.boxContents).toEqual(["1 × Lanciatore"]);
    expect(product.tags).toEqual(["offerta"]);
    expect(product.category).toBe("accessori");
    expect(product.tagline).toBe("Solo la stampa NERV.");
  });

  it("shows the cover first and only the shop's own published files", () => {
    expect(apply(row(["images"])).images.map((image) => image.alt)).toEqual(["Copertina", "Seconda"]);
    // With none of the shop's files left, a page keeps the catalogue's photos rather than none.
    expect(apply(row(["images"], { images: [] })).images).toEqual(catalogued.images);
  });

  it("never blanks a field: an empty text or a list read without its rows keeps the catalogue's", () => {
    const product = apply(row(["name", "specs", "category"], { name: "  ", specs: null, category: { slug: "giochi" } }));
    expect(product.name).toBe(catalogued.name);
    expect(product.specs).toEqual(catalogued.specs);
    expect(product.category).toBe(catalogued.category);
  });

  it("names the product the same in the shop, the page and the cart", async () => {
    const stock: LiveStockRow = { slug: SLUG, stock_status: "disponibile", stock_quantity: 6, preorder_allocation: 0, availability_override: null, allow_backorder: false };
    const live: readonly Product[] = applyStorefrontContent(applyLiveStock(PRODUCTS, [stock]), [row(["name"])]);
    const provider = createMockProvider(live);
    expect((await provider.getProduct(SLUG))?.name).toBe("Long Winder Launcher Evangelion");
    const quote = await provider.quoteCart({ lines: [{ slug: SLUG, quantity: 1 }] } as CartQuoteRequest);
    expect(quote.lines[0]!.name).toBe("Long Winder Launcher Evangelion");
  });
});

describe("what a save on the sheet records", () => {
  const before = { name: "Custom Grip Takara Tomy", tagline: "Tre colori.", description: "Testo.", category_id: 4, blade_type: null };

  it("is the content fields that changed", () => {
    expect(changedContentFields(before, { name: "BX-11 Launcher Grip", tagline: "Tre colori.", description: "Testo. ", categoryId: 4, bladeType: null })).toEqual(["name"]);
    expect(changedContentFields(before, { name: before.name, tagline: "Nero.", description: "Altro.", categoryId: 2, bladeType: "attacco" })).toEqual([
      "tagline", "description", "category", "blade_type",
    ]);
  });

  it("adds to what was recorded before, once each", () => {
    expect(mergeStorefrontFields(["images", "name"], ["name", "specs"])).toEqual(["name", "specs", "images"]);
    expect(mergeStorefrontFields(null, [])).toEqual([]);
    expect(mergeStorefrontFields(["boh"], ["tags"])).toEqual(["tags"]);
  });
});
