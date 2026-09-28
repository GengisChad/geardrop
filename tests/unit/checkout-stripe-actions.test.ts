import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { CHECKOUT_UNAVAILABLE, checkoutErrorMessage } from "@/lib/commerce/checkout-errors";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/limits";
import { STRIPE_BLOCKED_NOTICE } from "@/lib/payments/stripe-checkout";
import type * as StripeCheckoutModule from "@/lib/payments/stripe-checkout";
import { fakeSettingsClient, type SettingsRead } from "../support/site-settings-client";

const stripeEnabledMock = vi.hoisted(() => vi.fn(() => true));
const createStripeCheckoutMock = vi.hoisted(() => vi.fn());
const placeOrderMock = vi.hoisted(() => vi.fn());
const originMock = vi.hoisted(() => vi.fn(() => "http://localhost:3000"));
const providerNameMock = vi.hoisted(() => vi.fn(() => "mock"));
const publicClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/commerce/order-intake", () => ({ placeOrder: placeOrderMock }));
vi.mock("@/lib/commerce/provider", async () => {
  const { createMockProvider } = await import("@/lib/commerce/mock-provider");
  return { getCommerceProvider: async () => createMockProvider(), resolveCommerceProviderName: providerNameMock };
});
vi.mock("@/lib/payments/stripe-checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeCheckoutModule>()),
  stripeCheckoutEnabled: stripeEnabledMock,
  createStripeCheckout: createStripeCheckoutMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: originMock() }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: publicClientMock }));

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

/** Production today: Stripe sells the static catalogue while `accept_orders` stays false. */
const productionSwitches: SettingsRead = { row: { maintenance_mode: false, accept_orders: false } };

function useSwitches(read: SettingsRead) {
  const fake = fakeSettingsClient(read);
  publicClientMock.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  providerNameMock.mockReturnValue("mock");
  useSwitches(productionSwitches);
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

describe("commerce write guard at checkout", () => {
  it("stops the Stripe checkout during maintenance, before any payment page", async () => {
    useSwitches({ row: { maintenance_mode: true, accept_orders: true } });

    const result = await submitOrder(order);

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/manutenzione/i) });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("answers the cart quote with a closed, non-orderable state during maintenance", async () => {
    useSwitches({ row: { maintenance_mode: true, accept_orders: true } });

    const quote = await requestCartQuote({ lines: order.lines });

    expect(quote).toMatchObject({ orderIntake: "closed", orderable: false, notice: expect.stringMatching(/manutenzione/i) });
    // The buyer still sees the cart: lines and totals come from the catalogue as usual.
    expect(quote.lines).toHaveLength(1);
    expect(quote.totals.total.amount).toBeGreaterThan(0);
  });

  it("leaves the database quote alone when only accept_orders is false: it already reads closed", async () => {
    stripeEnabledMock.mockReturnValue(false);
    providerNameMock.mockReturnValue("supabase");
    useSwitches({ row: { maintenance_mode: false, accept_orders: false } });

    const quote = await requestCartQuote({ lines: order.lines });

    expect(quote.lines).toHaveLength(1);
    expect(quote.notice).not.toMatch(/manutenzione|stato del negozio/i);
  });

  it("refuses to open a payment when the shop switches cannot be read", async () => {
    useSwitches({ reject: new Error("AbortError: signal timed out") });

    expect(await submitOrder(order)).toEqual({ ok: false, message: expect.stringMatching(/stato del negozio/i) });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses when the public database client cannot even be built", async () => {
    publicClientMock.mockImplementation(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    });

    expect(await submitOrder(order)).toMatchObject({ ok: false });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("closes the database checkout while accept_orders is false", async () => {
    stripeEnabledMock.mockReturnValue(false);
    providerNameMock.mockReturnValue("supabase");

    expect(await submitOrder(order)).toEqual({ ok: false, message: expect.stringMatching(/non sono ancora attivi/i) });
    expect(placeOrderMock).not.toHaveBeenCalled();
  });

  it("does not consult the switches when no order backend exists", async () => {
    stripeEnabledMock.mockReturnValue(false);
    const { from } = useSwitches({ row: { maintenance_mode: true, accept_orders: false } });

    await submitOrder(order);
    await requestCartQuote({ lines: order.lines });

    expect(from).not.toHaveBeenCalled();
  });
});
