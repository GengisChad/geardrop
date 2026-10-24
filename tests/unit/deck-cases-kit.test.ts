import { describe, expect, it } from "vitest";
import {
  BUNDLES,
  DECK_CASE_PRICE,
  DECK_CASE_SLUGS,
  DECK_CASE_WITH_KIT,
  KEPT_OFF_GOOGLE,
  PRODUCTS,
} from "@/data/catalog";
import { VARIANT_FAMILIES } from "@/data/variant-families";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuote } from "@/lib/commerce/types";
import { stripeProductId } from "@/lib/payments/stripe-api";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe, type StripePriceRow } from "@/lib/payments/stripe-checkout";

const bicolore = PRODUCTS.filter((product) => product.variant?.family === "porta-deck-bicolore");
const priceOf = (slug: string) => [...PRODUCTS, ...BUNDLES].find((product) => product.slug === slug)!.price.amount;

async function quote(lines: readonly { slug: string; quantity: number }[]): Promise<CartQuote> {
  return openQuoteForStripe(await createMockProvider().quoteCart({ lines: lines as never }));
}

describe("deck cases, 2026-10-24", () => {
  it("sells seven two-colour cases at €18, each with its own photo and a two-colour swatch", () => {
    expect(bicolore.map((product) => product.variant?.label)).toEqual([
      "Nero e blu",
      "Nero e rosso",
      "Nero e oro",
      "Giallo e nero",
      "Rosso e oro",
      "Viola e verde",
      "Viola e argento",
    ]);
    for (const product of bicolore) {
      expect(product).toMatchObject({ category: "accessori", price: { amount: DECK_CASE_PRICE }, stock: "disponibile", unofficial: true });
      expect(product.name).toBe(`Porta Deck Bicolore ${product.variant?.label}`);
      // No count: the shop has plenty and never caps the cart.
      expect(product.availableQuantity).toBeUndefined();
      expect(product.images.map((image) => image.src)).toEqual([`/products/${product.slug}.webp`]);
      expect(product.variant?.swatch).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6} 50%, #[0-9a-f]{6} 50%\)$/);
      expect(product.description).toContain("non è prodotto né certificato da Hasbro o Takara Tomy");
      // The printed logo is not licensed: the name never carries the trademark.
      expect(product.name).not.toMatch(/beyblade/i);
    }
    expect(DECK_CASE_PRICE).toBe(1800);
    expect(VARIANT_FAMILIES["porta-deck-bicolore"]?.colours).toHaveLength(7);
  });

  it("keeps only the two-colour cases off Google", () => {
    expect([...KEPT_OFF_GOOGLE].sort()).toEqual(bicolore.map((product) => product.slug).sort());
    expect(KEPT_OFF_GOOGLE.has("porta-deck-giallo")).toBe(false);
    expect(DECK_CASE_SLUGS.size).toBe(14);
  });

  it("prices the kits that hold a case as their pieces at full price with the case at €15", () => {
    const expected: Record<string, number> = { "kit-doppio-starter-deck": 3690, "kit-arena-drop-completo": 7190, "kit-arena-sneak-completo": 7690 };
    for (const [slug, price] of Object.entries(expected)) {
      const kit = BUNDLES.find((bundle) => bundle.slug === slug)!;
      const parts = kit.bundleOf!.reduce((sum, part) => sum + priceOf(part.slug) * part.quantity, 0);
      expect(kit.price.amount).toBe(price);
      // Compare-at stays the sum of the parts at list price, the case now at €18.
      expect(kit.compareAtPrice?.amount).toBe(parts);
      const saving = (parts - price) / 100;
      expect(kit.features).toContainEqual(expect.objectContaining({ title: `Risparmi €${saving.toFixed(2).replace(".", ",")}` }));
    }
  });
});

describe("a deck case next to a kit costs €15", () => {
  it("prices one case per kit at €15 and says so in the totals", async () => {
    const priced = await quote([
      { slug: "kit-doppio-starter-deck", quantity: 1 },
      { slug: "porta-deck-nero-blu", quantity: 1 },
    ]);
    const deck = priced.lines.find((line) => line.slug === "porta-deck-nero-blu")!;
    expect(deck.unitPrice.amount).toBe(DECK_CASE_PRICE);
    expect(deck.kitUnitPrice).toEqual({ amount: DECK_CASE_WITH_KIT, currency: "EUR" });
    expect(priced.totals.discount.amount).toBe(DECK_CASE_PRICE - DECK_CASE_WITH_KIT);
    expect(priced.totals.total.amount).toBe(priceOf("kit-doppio-starter-deck") + DECK_CASE_WITH_KIT + priced.totals.shipping.amount);
    expect(priced.kitDeckSlots).toBeUndefined();
  });

  it("offers the price while a kit has no case, and never without a kit", async () => {
    expect((await quote([{ slug: "kit-arena-drop-completo", quantity: 2 }])).kitDeckSlots).toBe(2);
    const alone = await quote([{ slug: "porta-deck-giallo", quantity: 1 }]);
    expect(alone.lines[0]?.kitUnitPrice).toBeUndefined();
    expect(alone.totals.discount.amount).toBe(0);
    expect(alone.kitDeckSlots).toBeUndefined();
  });

  it("prices a case line whole: two of a colour with one kit stay at €18, one per kit each get €15", async () => {
    const tooMany = await quote([
      { slug: "promo-attack", quantity: 1 },
      { slug: "porta-deck-rosso-oro", quantity: 2 },
    ]);
    expect(tooMany.lines.find((line) => line.slug === "porta-deck-rosso-oro")?.kitUnitPrice).toBeUndefined();
    expect(tooMany.kitDeckSlots).toBe(1);

    const two = await quote([
      { slug: "promo-attack", quantity: 2 },
      { slug: "porta-deck-rosso-oro", quantity: 2 },
    ]);
    expect(two.lines.find((line) => line.slug === "porta-deck-rosso-oro")?.kitUnitPrice?.amount).toBe(DECK_CASE_WITH_KIT);
    expect(two.totals.discount.amount).toBe(2 * (DECK_CASE_PRICE - DECK_CASE_WITH_KIT));

    const mixed = await quote([
      { slug: "duo-horus-enlil", quantity: 1 },
      { slug: "porta-deck-viola-verde", quantity: 1 },
      { slug: "porta-deck-azzurro", quantity: 1 },
    ]);
    expect(mixed.lines.filter((line) => line.kitUnitPrice).map((line) => line.slug)).toEqual(["porta-deck-viola-verde"]);
  });

  it("charges the €15 case on Stripe through the case's own product, and tells the buyer", async () => {
    const priced = await quote([
      { slug: "kit-doppio-starter-deck", quantity: 1 },
      { slug: "porta-deck-nero-blu", quantity: 1 },
    ]);
    const prices: StripePriceRow[] = [...PRODUCTS, ...BUNDLES].map((product) => ({
      id: `price_${product.slug}`,
      lookup_key: stripeProductId(product.slug),
      unit_amount: product.price.amount,
      currency: "eur",
      active: true,
    }));
    const order: PlaceOrderInput = {
      contact: {
        email: "kit@email.it",
        firstName: "Mario",
        lastName: "Rossi",
        address: "Via Roma 1",
        city: "Milano",
        postalCode: "20121",
        province: "MI",
        phone: "+39 333 1234567",
        shippingMethod: "inpost-locker",
        pickupPoint: "ITMIL01M · Via Roma 1, 20121 Milano",
      },
      lines: priced.lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
      idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f608",
    };
    const fields = buildCheckoutSessionFields({ quote: priced, order, origin: "https://geardropshop.it" }, matchStripePrices(priced, prices)!);
    const deckIndex = priced.lines.findIndex((line) => line.slug === "porta-deck-nero-blu");
    const kitIndex = priced.lines.findIndex((line) => line.slug === "kit-doppio-starter-deck");
    expect(fields[`line_items[${deckIndex}][price_data][product]`]).toBe(stripeProductId("porta-deck-nero-blu"));
    expect(fields[`line_items[${deckIndex}][price_data][unit_amount]`]).toBe(DECK_CASE_WITH_KIT);
    expect(fields[`line_items[${deckIndex}][price]`]).toBeUndefined();
    expect(fields[`line_items[${kitIndex}][price]`]).toBe("price_kit-doppio-starter-deck");
    expect(String(fields["custom_text[submit][message]"])).toContain("Porta deck a 15 € con il kit.");
  });
});

describe("Google", () => {
  it("leaves the two-colour cases out of the Merchant feed and keeps the single-colour ones at €18", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    for (const product of bicolore) expect(xml).not.toContain(`<g:id>${product.slug}</g:id>`);
    const giallo = xml.split("<item>").find((chunk) => chunk.includes("<g:id>porta-deck-giallo</g:id>")) ?? "";
    expect(giallo).toContain("<g:price>18.00 EUR</g:price>");
  });
});
