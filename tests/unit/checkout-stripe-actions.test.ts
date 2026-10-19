import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";
import { CHECKOUT_UNAVAILABLE, checkoutErrorMessage } from "@/lib/commerce/checkout-errors";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/limits";
import { STRIPE_BLOCKED_NOTICE } from "@/lib/payments/stripe-checkout";
import type * as StripeCheckoutModule from "@/lib/payments/stripe-checkout";
import type { Product } from "@/lib/commerce/types";

const stripeEnabledMock = vi.hoisted(() => vi.fn(() => true));
const createStripeCheckoutMock = vi.hoisted(() => vi.fn());
const placeOrderMock = vi.hoisted(() => vi.fn());
const originMock = vi.hoisted(() => vi.fn(() => "http://localhost:3000"));

// Owner, 2026-10-19: the Takara NerdPoint products are sold out, so the express-checkout
// test that verifies the partner shipping lock must inject an in-stock Takara fixture rather
// than using a real catalog slug. The ref is read inside getCommerceProvider on every call.
const _providerCatalog = vi.hoisted(() => ({ value: null as readonly Product[] | null }));

vi.mock("@/lib/commerce/order-intake", () => ({ placeOrder: placeOrderMock }));
vi.mock("@/lib/commerce/provider", async () => {
  const { createMockProvider } = await import("@/lib/commerce/mock-provider");
  const override = _providerCatalog;
  return {
    getCommerceProvider: async () => createMockProvider(override.value ?? undefined),
    resolveCommerceProviderName: () => "mock",
  };
});
vi.mock("@/lib/payments/stripe-checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeCheckoutModule>()),
  stripeCheckoutEnabled: stripeEnabledMock,
  createStripeCheckout: createStripeCheckoutMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: originMock() }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const { requestCartQuote, submitOrder, startExpressCheckout } = await import("@/app/(storefront)/checkout/actions");
const { EXPRESS_CHECKOUT_LOCKED_MESSAGE } = await import("@/lib/payments/express-checkout");

const order = {
  contact: {
    email: "mario.rossi@email.it",
    firstName: "Mario",
    lastName: "Rossi",
    address: "Via Roma 1",
    city: "Milano",
    postalCode: "20121",
    province: "MI",
    phone: "+39 333 1234567",
    // InPost Locker is the cheapest method and the default selection (owner, 2026-10-13).
    shippingMethod: "inpost-locker",
    pickupPoint: "Locker Milano Centrale",
  },
  lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

beforeEach(() => {
  vi.clearAllMocks();
  stripeEnabledMock.mockReturnValue(true);
  originMock.mockReturnValue("http://localhost:3000");
  createStripeCheckoutMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5f6" });
  // Reset catalog override so unrelated tests use the default catalogue.
  _providerCatalog.value = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  _providerCatalog.value = null;
});

describe("checkout with Stripe and no order database", () => {
  it("opens the catalogue quote for payment", async () => {
    expect(await requestCartQuote({ lines: order.lines })).toMatchObject({
      orderIntake: "open",
      orderable: true,
      payment: "stripe",
    });
  });

  it("hands the buyer to Stripe without touching the order database", async () => {
    expect(await submitOrder(order)).toEqual({
      ok: true,
      redirectUrl: "https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5f6",
    });
    expect(placeOrderMock).not.toHaveBeenCalled();

    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.origin).toBe("http://localhost:3000");
    expect(input.order).toEqual(order);
    // The cart is one Cobalt Dragoon plus InPost Locker shipping; both numbers come from the catalogue.
    const dragoon = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!.price.amount;
    expect(input.quote.totals.total).toEqual({ amount: dragoon + SHIPPING_FLAT_RATE, currency: "EUR" });
  });

  it("pins the return URL to the canonical origin in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    originMock.mockReturnValue("https://preview-geardrop.vercel.app");

    await submitOrder(order);

    expect(createStripeCheckoutMock.mock.calls[0]?.[0].origin).toBe("https://geardropshop.it");
  });

  it("prices the cart again and refuses what the catalogue cannot sell", async () => {
    // A quantity the schema accepts but the product's allocation cannot cover.
    const scarce = PRODUCTS.find((product) => (product.availableQuantity ?? Infinity) < MAX_QUANTITY_PER_LINE)!;
    const lines = [{ slug: scarce.slug, quantity: (scarce.availableQuantity ?? 0) + 1 }];

    expect(await submitOrder({ ...order, lines })).toEqual({
      ok: false,
      message: STRIPE_BLOCKED_NOTICE,
    });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("shows the Stripe failure message and keeps the cart", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: false, message: "Il pagamento non è disponibile." });

    expect(await submitOrder(order)).toEqual({ ok: false, message: "Il pagamento non è disponibile." });
  });

  it("still refuses orders when Stripe is not configured", async () => {
    stripeEnabledMock.mockReturnValue(false);

    expect(await submitOrder(order)).toEqual({
      ok: false,
      message: checkoutErrorMessage({ message: CHECKOUT_UNAVAILABLE }),
    });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });
});

const IDEMPOTENCY_KEY = "9f8e7d6c-5b4a-4321-8765-a1b2c3d4e5f6";
const EXPRESS_SESSION_URL = "https://checkout.stripe.com/c/pay/cs_live_express_123";

// Fixture: an in-stock Takara Tomy product used to test the partner shipping lock.
// Owner, 2026-10-19: the three real Takara NerdPoint products are sold out, so a sold-out
// slug would fail at the "orderable" gate before reaching the shipping-lock gate. An
// in-stock fixture keeps the coverage for the partner plan without relying on catalog stock.
const TAKARA_INSTOCK_FIXTURE: Product = {
  ...(PRODUCTS.find((p) => p.slug === "cobalt-dragoon-2-60c")!),
  slug: "test-takara-instock-fixture" as Product["slug"],
  brand: "takara-tomy" as const,
  consignment: true,
  commissionCents: 300,
  stock: "disponibile",
  availableQuantity: 5,
};

describe("startExpressCheckout", () => {
  it("creates a Stripe session and returns the redirect URL for a Hasbro-only cart", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: true, redirectUrl: EXPRESS_SESSION_URL });
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    // The session must declare express mode
    expect(input.express).toBe(true);
    // Stripe, not the site, collects the address: no contact in the order
    expect(input.order).not.toHaveProperty("contact");
    // Quoted with Poste home, which is the only express-compatible method
    expect(input.quote.shippingCode).toBe("standard");
  });

  it("passes the idempotency key through to the session builder", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.order.idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it("refuses an unoorderable cart (mixed pre-orders, line issues, etc.)", async () => {
    // A quantity beyond the allocation marks the line as having an issue, making it non-orderable.
    const scarce = PRODUCTS.find((p) => (p.availableQuantity ?? Infinity) < MAX_QUANTITY_PER_LINE)!;

    const result = await startExpressCheckout({
      lines: [{ slug: scarce.slug, quantity: (scarce.availableQuantity ?? 0) + 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.ok).toBe(false);
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a Takara-only cart (locked to partner Poste-point, not standard)", async () => {
    // Owner 2026-10-19: real Takara NerdPoint products are sold out; inject an in-stock
    // fixture so the test reaches the shipping-lock gate (plan has no "standard" method).
    _providerCatalog.value = [TAKARA_INSTOCK_FIXTURE];

    const result = await startExpressCheckout({
      lines: [{ slug: TAKARA_INSTOCK_FIXTURE.slug, quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: false, message: EXPRESS_CHECKOUT_LOCKED_MESSAGE });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses an invalid cart payload (malformed slug or invalid key)", async () => {
    expect(
      await startExpressCheckout({ lines: [{ slug: "INVALID SLUG!", quantity: 1 }], idempotencyKey: IDEMPOTENCY_KEY }),
    ).toMatchObject({ ok: false });
    expect(
      await startExpressCheckout({ lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }], idempotencyKey: "not-a-uuid" }),
    ).toMatchObject({ ok: false });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses when Stripe is not configured", async () => {
    stripeEnabledMock.mockReturnValue(false);

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.ok).toBe(false);
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("surfaces the Stripe error message on session creation failure", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: false, message: "Il pagamento non è disponibile." });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: false, message: "Il pagamento non è disponibile." });
  });
});
