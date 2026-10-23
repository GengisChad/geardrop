import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLES, FREE_SHIPPING_THRESHOLD, PRODUCTS } from "@/data/catalog";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import {
  CLUB_DISCOUNT_PERCENT,
  CLUB_MIN_ORDER_CENTS,
  clubUnitPrice,
  findClub,
  parseClubCodes,
} from "@/lib/commerce/club-pricing";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuote } from "@/lib/commerce/types";
import { paidCheckoutFromStripe } from "@/lib/orders/stripe-order";
import { stripeProductId } from "@/lib/payments/stripe-api";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe, type StripePriceRow } from "@/lib/payments/stripe-checkout";

const CLUBS = "ROYALBLADE=Royal Blade; clubnord = Club Nord";

const order: PlaceOrderInput = {
  contact: {
    email: "club@email.it",
    firstName: "Mario",
    lastName: "Rossi",
    address: "Via Roma 1",
    city: "Milano",
    postalCode: "20121",
    province: "MI",
    phone: "+39 333 1234567",
    shippingMethod: "standard",
  },
  lines: [{ slug: "soar-phoenix-9-60gf", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

const catalogPrices: StripePriceRow[] = PRODUCTS.map((product) => ({
  id: `price_${product.slug}`,
  lookup_key: stripeProductId(product.slug),
  unit_amount: product.price.amount,
  currency: "eur",
  active: true,
}));

const priceOf = (slug: string) => PRODUCTS.find((product) => product.slug === slug)!.price.amount;

// Six Phoenix (A, 15 %), two Drop Attack (B, 10 %), two Enlil (C, none): well over the minimum.
const clubCart = [
  { slug: "soar-phoenix-9-60gf", quantity: 6 },
  { slug: "drop-attack-battle-set", quantity: 2 },
  { slug: "hurricane-enlil-is-7-55t", quantity: 2 },
] as const;

async function quote(lines: readonly { slug: string; quantity: number }[], couponCode?: string): Promise<CartQuote> {
  return openQuoteForStripe(
    await createMockProvider().quoteCart({ lines: lines as never, shippingCode: "standard", ...(couponCode ? { couponCode } : {}) }),
  );
}

beforeEach(() => {
  vi.stubEnv("CLUB_CODES", CLUBS);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("club tiers", () => {
  it("prices only products the shop owns outright, never a bundle or a partner's piece", () => {
    for (const [slug, percent] of Object.entries(CLUB_DISCOUNT_PERCENT)) {
      const product = PRODUCTS.find((candidate) => candidate.slug === slug);
      expect(product, slug).toBeDefined();
      expect(product?.consignment, slug).toBeUndefined();
      expect(BUNDLES.some((bundle) => bundle.slug === slug), slug).toBe(false);
      expect([10, 15], slug).toContain(percent);
    }
  });

  it("leaves a product without a tier at its catalogue price", () => {
    expect(clubUnitPrice("hurricane-enlil-is-7-55t", { amount: 999, currency: "EUR" }).amount).toBe(999);
    expect(clubUnitPrice("buster-dran-5-70db", { amount: 890, currency: "EUR" }).amount).toBe(890);
  });

  it("rounds the club price to the cent", () => {
    expect(clubUnitPrice("soar-phoenix-9-60gf", { amount: 2490, currency: "EUR" }).amount).toBe(2117);
    expect(clubUnitPrice("drop-attack-battle-set", { amount: 3990, currency: "EUR" }).amount).toBe(3591);
  });
});

describe("club codes", () => {
  it("reads the clubs from the environment, whatever the case and spacing", () => {
    const clubs = parseClubCodes(CLUBS);
    expect([...clubs.values()]).toEqual([
      { code: "ROYALBLADE", name: "Royal Blade" },
      { code: "CLUBNORD", name: "Club Nord" },
    ]);
    expect(findClub(" royalblade ")).toEqual({ code: "ROYALBLADE", name: "Royal Blade" });
  });

  it("skips malformed entries instead of guessing", () => {
    expect(parseClubCodes("NONAME=; =Senza codice; AB=Troppo corto; SENZAUGUALE").size).toBe(0);
    expect(findClub("ROYALBLADE", {})).toBeNull();
  });
});

describe("club quote", () => {
  it("discounts the tiered lines and leaves the rest at full price", async () => {
    const priced = await quote(clubCart, "royalblade");
    const phoenix = priced.lines.find((line) => line.slug === "soar-phoenix-9-60gf")!;
    const drop = priced.lines.find((line) => line.slug === "drop-attack-battle-set")!;
    const enlil = priced.lines.find((line) => line.slug === "hurricane-enlil-is-7-55t")!;

    expect(priced.couponCode).toBe("ROYALBLADE");
    expect(priced.couponError).toBeNull();
    expect(phoenix.clubUnitPrice?.amount).toBe(Math.round(priceOf("soar-phoenix-9-60gf") * 0.85));
    expect(drop.clubUnitPrice?.amount).toBe(Math.round(priceOf("drop-attack-battle-set") * 0.9));
    expect(enlil.clubUnitPrice).toBeUndefined();

    const discount =
      6 * (phoenix.unitPrice.amount - phoenix.clubUnitPrice!.amount) + 2 * (drop.unitPrice.amount - drop.clubUnitPrice!.amount);
    expect(priced.totals.discount.amount).toBe(discount);
    expect(priced.totals.total.amount).toBe(priced.totals.subtotal.amount - discount + priced.totals.shipping.amount);
  });

  it("holds only from the minimum cart at full price, and says how much is missing", async () => {
    const priced = await quote([{ slug: "soar-phoenix-9-60gf", quantity: 1 }], "ROYALBLADE");
    expect(priced.couponCode).toBeNull();
    expect(priced.couponError).toContain("ne mancano");
    expect(priced.totals.discount.amount).toBe(0);
    expect(priced.lines[0]?.clubUnitPrice).toBeUndefined();
    expect(priceOf("soar-phoenix-9-60gf")).toBeLessThan(CLUB_MIN_ORDER_CENTS);
  });

  it("refuses a code no club holds", async () => {
    const priced = await quote(clubCart, "NESSUNO");
    expect(priced.couponCode).toBeNull();
    expect(priced.couponError).toBe("Codice club non valido.");
    expect(priced.totals.discount.amount).toBe(0);
  });

  it("measures free shipping on what the club pays", async () => {
    const priced = await quote(clubCart, "ROYALBLADE");
    expect(priced.totals.subtotal.amount - priced.totals.discount.amount).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(priced.totals.shipping.amount).toBe(0);
  });
});

describe("club checkout on Stripe", () => {
  it("charges the tiered lines at the club price on the catalogue's own Stripe product", async () => {
    const priced = await quote(clubCart, "ROYALBLADE");
    const fields = buildCheckoutSessionFields({ quote: priced, order, origin: "https://geardropshop.it" }, matchStripePrices(priced, catalogPrices)!);
    const index = (slug: string) => priced.lines.findIndex((line) => line.slug === slug);
    const phoenix = index("soar-phoenix-9-60gf");
    const enlil = index("hurricane-enlil-is-7-55t");

    expect(fields[`line_items[${phoenix}][price]`]).toBeUndefined();
    expect(fields[`line_items[${phoenix}][price_data][product]`]).toBe("gd_soar_phoenix_9_60gf");
    expect(fields[`line_items[${phoenix}][price_data][unit_amount]`]).toBe(priced.lines[phoenix]!.clubUnitPrice!.amount);
    expect(fields[`line_items[${phoenix}][price_data][currency]`]).toBe("eur");
    expect(fields[`line_items[${phoenix}][price_data][tax_behavior]`]).toBe("inclusive");
    expect(fields[`line_items[${phoenix}][quantity]`]).toBe(6);
    expect(fields[`line_items[${enlil}][price]`]).toBe("price_hurricane-enlil-is-7-55t");
    expect(fields["metadata[club]"]).toBe("ROYALBLADE");
    expect(fields["allow_promotion_codes"]).toBe("false");
    expect(fields["custom_text[submit][message]"]).toBe("Prezzi club applicati (ROYALBLADE).");
  });

  it("charges exactly what the quote showed", async () => {
    const priced = await quote(clubCart, "ROYALBLADE");
    const fields = buildCheckoutSessionFields({ quote: priced, order, origin: "https://geardropshop.it" }, matchStripePrices(priced, catalogPrices)!);
    const charged = priced.lines.reduce((sum, line, index) => {
      const unit = (fields[`line_items[${index}][price_data][unit_amount]`] as number | undefined) ?? line.unitPrice.amount;
      return sum + unit * line.quantity;
    }, 0);
    expect(charged).toBe(priced.totals.subtotal.amount - priced.totals.discount.amount);
  });

  it("files the paid order under the club's code, read from the product id", () => {
    const checkout = paidCheckoutFromStripe(
      {
        id: "cs_live_a1b2c3d4e5f6",
        created: 1_792_000_000,
        payment_status: "paid",
        client_reference_id: "GD-CLUB0001",
        customer_details: { email: "club@email.it" },
        metadata: { club: "ROYALBLADE" },
        amount_total: 12702,
        total_details: { amount_shipping: 0, amount_discount: 0 },
      },
      [{ description: "Soar Phoenix 9-60GF", quantity: 6, price: { lookup_key: null, unit_amount: 2117, product: "gd_soar_phoenix_9_60gf" } }],
    );
    expect(checkout?.couponCode).toBe("ROYALBLADE");
    expect(checkout?.lines).toEqual([{ slug: "soar-phoenix-9-60gf", name: "Soar Phoenix 9-60GF", quantity: 6, unitPriceCents: 2117 }]);
  });
});
