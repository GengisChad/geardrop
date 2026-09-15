import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { CHECKOUT_UNAVAILABLE, checkoutErrorMessage } from "@/lib/commerce/checkout-errors";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/limits";
import { STRIPE_BLOCKED_NOTICE } from "@/lib/payments/stripe-checkout";
import type * as StripeCheckoutModule from "@/lib/payments/stripe-checkout";

const stripeEnabledMock = vi.hoisted(() => vi.fn(() => true));
const createStripeCheckoutMock = vi.hoisted(() => vi.fn());
const placeOrderMock = vi.hoisted(() => vi.fn());
const originMock = vi.hoisted(() => vi.fn(() => "http://localhost:3000"));

vi.mock("@/lib/commerce/order-intake", () => ({ placeOrder: placeOrderMock }));
vi.mock("@/lib/commerce/provider", async () => {
  const { createMockProvider } = await import("@/lib/commerce/mock-provider");
  return { getCommerceProvider: async () => createMockProvider(), resolveCommerceProviderName: () => "mock" };
});
vi.mock("@/lib/payments/stripe-checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeCheckoutModule>()),
  stripeCheckoutEnabled: stripeEnabledMock,
  createStripeCheckout: createStripeCheckoutMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: originMock() }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const { requestCartQuote, submitOrder } = await import("@/app/(storefront)/checkout/actions");

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
    shippingMethod: "standard",
  },
  lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

beforeEach(() => {
  vi.clearAllMocks();
  stripeEnabledMock.mockReturnValue(true);
  originMock.mockReturnValue("http://localhost:3000");
  createStripeCheckoutMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5f6" });
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    expect(input.quote.totals.total).toEqual({ amount: 3040, currency: "EUR" });
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
