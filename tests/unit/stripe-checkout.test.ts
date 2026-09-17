import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuote, CartQuoteRequest } from "@/lib/commerce/types";
import { stripeProductId, type StripeClient } from "@/lib/payments/stripe-api";
import {
  STRIPE_BLOCKED_NOTICE,
  STRIPE_PRICE_MISMATCH_MESSAGE,
  STRIPE_UNAVAILABLE_MESSAGE,
  buildCheckoutSessionFields,
  createStripeCheckout,
  matchStripePrices,
  openQuoteForStripe,
  orderReference,
  retrieveCheckoutSession,
  stripeCheckoutEnabled,
  type StripePriceRow,
} from "@/lib/payments/stripe-checkout";

const ORIGIN = "https://geardropshop.it";
const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5f6";
const ENV = { STRIPE_SECRET_KEY: "rk_test_placeholder" };

const order: PlaceOrderInput = {
  contact: {
    email: "mario.rossi@email.it",
    firstName: "Mario",
    lastName: "Rossi",
    address: "Via Roma 1",
    city: "Milano",
    postalCode: "20121",
    province: "MI",
    phone: "+39 333 1234567",
    shippingMethod: "standard",
    notes: "Citofono Rossi",
  },
  lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

const catalogPrices: StripePriceRow[] = PRODUCTS.map((product) => ({
  id: `price_${product.slug}`,
  lookup_key: stripeProductId(product.slug),
  unit_amount: product.price.amount,
  currency: "eur",
  active: true,
}));

async function quoteFor(lines: readonly { slug: string; quantity: number }[]): Promise<CartQuote> {
  return openQuoteForStripe(await createMockProvider().quoteCart({ lines } as CartQuoteRequest));
}

function fakeStripe(prices: readonly StripePriceRow[]) {
  const get = vi.fn(async (path: string) => (path.startsWith("/prices") ? { data: prices } : null));
  const post = vi.fn(async (_path: string, _fields: Record<string, unknown>, _key?: string) => ({ url: SESSION_URL }));
  return { client: { get, post } as unknown as StripeClient, get, post };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stripe checkout switch", () => {
  it("needs the stripe provider, a key and no order database", () => {
    expect(stripeCheckoutEnabled({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "rk_live_x" })).toBe(true);
    expect(stripeCheckoutEnabled({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "  " })).toBe(false);
    expect(stripeCheckoutEnabled({ PAYMENTS_PROVIDER: "mock", STRIPE_SECRET_KEY: "rk_live_x" })).toBe(false);
    expect(
      stripeCheckoutEnabled({ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "rk_live_x", COMMERCE_PROVIDER: "supabase" }),
    ).toBe(false);
  });

  it("opens a sellable catalogue quote for Stripe", async () => {
    expect(await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }])).toMatchObject({
      orderIntake: "open",
      orderable: true,
      notice: null,
      payment: "stripe",
    });
  });

  it("keeps a cart over the allocation blocked", async () => {
    expect(await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 11 }])).toMatchObject({
      orderable: false,
      notice: STRIPE_BLOCKED_NOTICE,
    });
  });

  it("never reopens a quote that comes from a real order backend", async () => {
    const closed: CartQuote = { ...(await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }])), orderIntake: "closed" };
    expect(openQuoteForStripe(closed)).toBe(closed);
  });
});

describe("stripe checkout session", () => {
  it("derives a short reference that is stable for one attempt", () => {
    const reference = orderReference(order.idempotencyKey);

    expect(reference).toMatch(/^GD-[A-HJ-NP-Z2-9]{8}$/);
    expect(orderReference(order.idempotencyKey)).toBe(reference);
    expect(orderReference("00000000-0000-4000-8000-000000000000")).not.toBe(reference);
  });

  it("only pairs lines with active Stripe prices that match the catalogue amount", async () => {
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);

    expect(matchStripePrices(quote, catalogPrices)?.get("cobalt-dragoon-2-60c")).toBe("price_cobalt-dragoon-2-60c");
    expect(matchStripePrices(quote, catalogPrices.map((price) => ({ ...price, unit_amount: 1 })))).toBeNull();
    expect(matchStripePrices(quote, catalogPrices.map((price) => ({ ...price, active: false })))).toBeNull();
    expect(matchStripePrices(quote, [])).toBeNull();
  });

  it("charges through price ids and carries the address collected on the site", async () => {
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 2 }]);
    const fields = buildCheckoutSessionFields({ quote, order, origin: ORIGIN }, matchStripePrices(quote, catalogPrices)!);

    expect(fields).toMatchObject({
      mode: "payment",
      locale: "it",
      customer_email: "mario.rossi@email.it",
      client_reference_id: orderReference(order.idempotencyKey),
      success_url: "https://geardropshop.it/checkout/successo?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://geardropshop.it/checkout",
      "line_items[0][price]": "price_cobalt-dragoon-2-60c",
      "line_items[0][quantity]": 2,
      "shipping_options[0][shipping_rate_data][display_name]": "Spedizione standard",
      "shipping_options[0][shipping_rate_data][fixed_amount][amount]": 490,
      "payment_intent_data[shipping][name]": "Mario Rossi",
      "payment_intent_data[shipping][address][postal_code]": "20121",
      "payment_intent_data[shipping][address][country]": "IT",
      "metadata[notes]": "Citofono Rossi",
      "metadata[lines]": "cobalt-dragoon-2-60c x2",
    });
    // The catalogue is in stock, so Stripe shows no pre-order notice.
    expect(fields["custom_text[submit][message]"]).toBeUndefined();
    expect(fields["metadata[preorder]"]).toBeUndefined();
    expect(Object.keys(fields).some((key) => key.includes("unit_amount"))).toBe(false);
  });

  it("warns on the Stripe page when a line is a pre-order", async () => {
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);
    const preorder: CartQuote = { ...quote, lines: quote.lines.map((line) => ({ ...line, stock: "pre-ordine" as const })) };
    const fields = buildCheckoutSessionFields({ quote: preorder, order, origin: ORIGIN }, matchStripePrices(preorder, catalogPrices)!);

    expect(fields["custom_text[submit][message]"]).toBe("In pre-ordine: 1 × Cobalt Dragoon 2-60C. Potrebbe arrivare tra 10/15 giorni lavorativi.");
    expect(fields["metadata[preorder]"]).toBe("cobalt-dragoon-2-60c x1");
  });

  it("ships free above the threshold", async () => {
    const quote = await quoteFor([
      { slug: "drop-attack-battle-set", quantity: 1 },
      { slug: "cobalt-dragoon-2-60c", quantity: 1 },
    ]);
    const fields = buildCheckoutSessionFields({ quote, order, origin: ORIGIN }, matchStripePrices(quote, catalogPrices)!);

    expect(fields["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(0);
    expect(fields["shipping_options[0][shipping_rate_data][display_name]"]).toBe("Spedizione gratuita");
    expect(fields["line_items[1][price]"]).toBe("price_cobalt-dragoon-2-60c");
  });

  it("creates the session from Stripe prices with a replay-safe idempotency key", async () => {
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);
    const stripe = fakeStripe(catalogPrices);

    expect(await createStripeCheckout({ quote, order, origin: ORIGIN }, ENV, stripe.client)).toEqual({ ok: true, url: SESSION_URL });
    await createStripeCheckout({ quote, order, origin: ORIGIN }, ENV, stripe.client);

    expect(stripe.get.mock.calls[0]?.[0]).toContain("lookup_keys%5B0%5D=gd_cobalt_dragoon_2_60c");
    expect(stripe.post.mock.calls[0]?.[0]).toBe("/checkout/sessions");
    expect(stripe.post.mock.calls[0]?.[2]).toMatch(/^gd-checkout-[0-9a-f]{40}$/);
    expect(stripe.post.mock.calls[1]?.[2]).toBe(stripe.post.mock.calls[0]?.[2]);
  });

  it("refuses to charge when Stripe and the catalogue disagree", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);
    const stripe = fakeStripe(catalogPrices.map((price) => ({ ...price, unit_amount: (price.unit_amount ?? 0) + 100 })));

    expect(await createStripeCheckout({ quote, order, origin: ORIGIN }, ENV, stripe.client)).toEqual({
      ok: false,
      message: STRIPE_PRICE_MISMATCH_MESSAGE,
    });
    expect(stripe.post).not.toHaveBeenCalled();
  });

  it("hides Stripe failures behind a neutral message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quote = await quoteFor([{ slug: "cobalt-dragoon-2-60c", quantity: 1 }]);
    const stripe = fakeStripe(catalogPrices);
    stripe.post.mockRejectedValueOnce(new Error("Stripe POST /checkout/sessions → 403: Permission denied"));

    expect(await createStripeCheckout({ quote, order, origin: ORIGIN }, ENV, stripe.client)).toEqual({
      ok: false,
      message: STRIPE_UNAVAILABLE_MESSAGE,
    });
    expect(await createStripeCheckout({ quote, order, origin: ORIGIN }, {}, stripe.client)).toEqual({
      ok: false,
      message: STRIPE_UNAVAILABLE_MESSAGE,
    });
  });
});

describe("stripe checkout result", () => {
  it("never sends a malformed session id to Stripe", async () => {
    const stripe = fakeStripe(catalogPrices);

    expect(await retrieveCheckoutSession("../../v1/charges", ENV, stripe.client)).toBeNull();
    expect(stripe.get).not.toHaveBeenCalled();
  });

  it("reports what Stripe says about the session", async () => {
    const get = vi.fn(async () => ({
      status: "complete",
      payment_status: "paid",
      client_reference_id: "GD-ABCDEFGH",
      amount_total: 3040,
      customer_details: { email: "mario.rossi@email.it" },
    }));

    expect(await retrieveCheckoutSession("cs_live_a1b2c3d4e5f6", ENV, { get, post: vi.fn() } as unknown as StripeClient)).toEqual({
      status: "complete",
      paymentStatus: "paid",
      reference: "GD-ABCDEFGH",
      totalCents: 3040,
      email: "mario.rossi@email.it",
    });
  });
});
