import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { bundlePartnersOf, bundlesLosingTheirSaving } from "@/lib/admin/bundle-saving-guard";
import { withBundles } from "@/lib/commerce/bundles";
import { applyLiveStock, type LiveStockRow } from "@/lib/commerce/live-stock-overlay";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuoteRequest, Product } from "@/lib/commerce/types";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import { stripeProductId } from "@/lib/payments/stripe-api";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe, type StripePriceRow } from "@/lib/payments/stripe-checkout";

// Owner, 2026-11-19: a price typed in "Listino e margini" has to reach the shop and Stripe.

const HORUS = "shatter-horus-9-65gb";
const ENLIL = "hurricane-enlil-is-7-55t";
const DUO = "duo-horus-enlil";

function row(slug: string, price?: number, compareAt?: number | null): LiveStockRow {
  return {
    slug,
    stock_status: "disponibile",
    stock_quantity: 50,
    preorder_allocation: 0,
    availability_override: null,
    allow_backorder: false,
    ...(price === undefined ? {} : { price_cents: price }),
    ...(compareAt === undefined ? {} : { compare_at_price_cents: compareAt }),
  };
}

/** The storefront catalogue with the database prices given, everything else as catalogued. */
function live(prices: Record<string, number>): readonly Product[] {
  const rows = PRODUCTS.map((product) => row(product.slug, prices[product.slug] ?? product.price.amount, product.compareAtPrice?.amount ?? null));
  return withBundles(applyLiveStock(PRODUCTS, rows), BUNDLES);
}

const find = (catalogue: readonly Product[], slug: string) => catalogue.find((product) => product.slug === slug)!;

describe("the database price", () => {
  it("is the price the shop shows, with the offer the back office holds", () => {
    const [horus] = applyLiveStock(PRODUCTS.filter((product) => product.slug === HORUS), [row(HORUS, 1099, 1299)]);
    expect(horus!.price.amount).toBe(1099);
    expect(horus!.compareAtPrice?.amount).toBe(1299);
  });

  it("drops a struck-through price that is not above the price", () => {
    const buster = PRODUCTS.find((product) => product.slug === "buster-dran-5-70db")!;
    expect(buster.compareAtPrice).toBeDefined();
    const [cleared] = applyLiveStock([buster], [row(buster.slug, 890, null)]);
    expect(cleared!.compareAtPrice).toBeUndefined();
    const [below] = applyLiveStock([buster], [row(buster.slug, 999, 999)]);
    expect(below!.compareAtPrice).toBeUndefined();
  });

  it("falls back to the catalogue when the row has no usable price", () => {
    const horus = PRODUCTS.find((product) => product.slug === HORUS)!;
    expect(applyLiveStock([horus], [row(HORUS)])[0]!.price.amount).toBe(horus.price.amount);
    expect(applyLiveStock([horus], [row(HORUS, 0)])[0]!.price.amount).toBe(horus.price.amount);
  });

  it("prices the cart", async () => {
    const quote = await createMockProvider(live({ [HORUS]: 1099 })).quoteCart({ lines: [{ slug: HORUS, quantity: 2 }] } as CartQuoteRequest);
    expect(quote.lines[0]!.unitPrice.amount).toBe(1099);
    expect(quote.totals.subtotal.amount).toBe(2198);
  });
});

describe("a bundle whose pack changed price", () => {
  it("keeps its own price and strikes through what the packs cost now, saving copy included", () => {
    const duo = find(live({ [HORUS]: 999 }), DUO);
    expect(duo.price.amount).toBe(1799);
    expect(duo.compareAtPrice?.amount).toBe(1998);
    expect(duo.tagline).toBe("Stamina contro bilanciata. Due starter, €1,99 in meno.");
    expect(duo.features).toContainEqual(
      expect.objectContaining({ title: "Risparmi €1,99", description: "€17,99 invece di €19,98 comprandoli separati" }),
    );
  });

  it("claims no saving once it costs as much as its packs", () => {
    const duo = find(live({ [HORUS]: 800 }), DUO);
    expect(duo.compareAtPrice).toBeUndefined();
    expect(duo.tagline).toBe("Stamina contro bilanciata. Due starter.");
    expect(duo.features.some((feature) => feature.title.startsWith("Risparmi"))).toBe(false);
  });

  it("is left exactly as catalogued while its packs keep their prices", () => {
    const catalogued = BUNDLES.find((bundle) => bundle.slug === DUO)!;
    const duo = find(live({}), DUO);
    expect(duo.compareAtPrice).toEqual(catalogued.compareAtPrice);
    expect(duo.tagline).toBe(catalogued.tagline);
    expect(duo.features).toEqual(catalogued.features);
  });
});

describe("Stripe, when the back office changed a price after the last sync", () => {
  it("charges the line at the shop's price on the same product instead of refusing the cart", async () => {
    const catalogue = live({ [HORUS]: 1099 });
    const quote = openQuoteForStripe(
      await createMockProvider(catalogue).quoteCart({ lines: [{ slug: HORUS, quantity: 1 }, { slug: ENLIL, quantity: 1 }] } as CartQuoteRequest),
    );
    // Stripe still holds the catalogue's amounts.
    const prices: StripePriceRow[] = PRODUCTS.map((product) => ({
      id: `price_${product.slug}`,
      lookup_key: stripeProductId(product.slug),
      unit_amount: product.price.amount,
      currency: "eur",
      active: true,
    }));
    const pairs = matchStripePrices(quote, prices);
    expect(pairs).not.toBeNull();
    expect([...(pairs!.drifted ?? [])]).toEqual([HORUS]);

    const order: PlaceOrderInput = {
      contact: {
        email: "prezzo@email.it",
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
      lines: quote.lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
      idempotencyKey: "4a2b3c4d-5e6f-4a70-8b91-c2d3e4f5a609",
    };
    const fields = buildCheckoutSessionFields({ quote, order, origin: "https://geardropshop.it" }, pairs!);
    const horus = quote.lines.findIndex((line) => line.slug === HORUS);
    const enlil = quote.lines.findIndex((line) => line.slug === ENLIL);
    expect(fields[`line_items[${horus}][price]`]).toBeUndefined();
    expect(fields[`line_items[${horus}][price_data][product]`]).toBe(stripeProductId(HORUS));
    expect(fields[`line_items[${horus}][price_data][unit_amount]`]).toBe(1099);
    expect(fields[`line_items[${enlil}][price]`]).toBe(`price_${ENLIL}`);
  });
});

describe("the back office warning", () => {
  it("lists the packs a price would leave without a saving", () => {
    expect(bundlePartnersOf(ENLIL)).toContain(HORUS);
    const names = bundlesLosingTheirSaving(HORUS, 500, new Map()).map((bundle) => bundle.slug);
    expect(names).toEqual(expect.arrayContaining([DUO, "kit-doppio-starter-deck", "trio-starter-arena"]));
    expect(names).not.toContain("kit-arena-drop-completo");
    expect(bundlesLosingTheirSaving(HORUS, 1099, new Map())).toEqual([]);
  });

  it("reads the other packs at their database price", () => {
    // Enlil already cut to 6,00 in the back office: Horus at 11,99 leaves the duo (17,99) at 17,99.
    expect(bundlesLosingTheirSaving(HORUS, 1199, new Map([[ENLIL, 600]])).map((bundle) => bundle.slug)).toContain(DUO);
  });
});
