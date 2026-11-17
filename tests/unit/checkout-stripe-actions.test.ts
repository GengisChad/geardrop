import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";
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
  // A club's coupon, as /admin/coupon holds it.
  const coupon = {
    code: "ROYALBLADE",
    discountKind: "percentage" as const,
    discountValue: 15,
    freeShipping: false,
    minimumSubtotalCents: 10000,
    maximumDiscountCents: null,
    productSlugs: [],
    categorySlugs: [],
    bundleSlugs: [],
    buyerNote: null,
  };
  return {
    getCommerceProvider: async () =>
      createMockProvider(undefined, async (code) => (code === coupon.code ? { status: "valid", coupon } : { status: "unknown" })),
    resolveCommerceProviderName: providerNameMock,
  };
});
vi.mock("@/lib/payments/stripe-checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeCheckoutModule>()),
  stripeCheckoutEnabled: stripeEnabledMock,
  createStripeCheckout: createStripeCheckoutMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: originMock() }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: publicClientMock }));
vi.mock("@/lib/org/storefront", () => ({ storefrontOrganizationId: async () => 1 }));

const { requestCartQuote, submitOrder, startExpressCheckout } = await import("@/app/(storefront)/checkout/actions");
const { EXPRESS_CHECKOUT_LOCKED_MESSAGE, EXPRESS_LOCKER_MISSING_MESSAGE } = await import("@/lib/payments/express-checkout");

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

  it("hands a club's cart to Stripe at the club price", async () => {
    const lines = [{ slug: "soar-phoenix-9-60gf", quantity: 7 }];

    expect(await submitOrder({ ...order, lines, couponCode: "royalblade" })).toMatchObject({ ok: true });
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.quote.couponCode).toBe("ROYALBLADE");
    expect(input.quote.totals.discount.amount).toBeGreaterThan(0);
  });

  it("never charges full price for a code the quote refused", async () => {
    // One Cobalt Dragoon is far below the club minimum.
    const short = await submitOrder({ ...order, couponCode: "ROYALBLADE" });
    expect(short).toMatchObject({ ok: false });
    expect(short.ok ? "" : short.message).toContain("ne mancano");

    expect(await submitOrder({ ...order, couponCode: "NESSUNO" })).toEqual({ ok: false, message: "Codice non valido." });
    expect(
      await startExpressCheckout({ lines: order.lines, idempotencyKey: "9f8e7d6c-5b4a-4321-8765-a1b2c3d4e5f6", couponCode: "NESSUNO" }),
    ).toEqual({ ok: false, message: "Codice non valido." });
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

const IDEMPOTENCY_KEY = "9f8e7d6c-5b4a-4321-8765-a1b2c3d4e5f6";
const EXPRESS_SESSION_URL = "https://checkout.stripe.com/c/pay/cs_live_express_123";
// The Locker the cart picked: Stripe cannot ask for one, so express carries it (owner, 2026-10-23).
const LOCKER = { pickupPoint: "Locker Roma Termini", pickupPointId: "IT_ITROM44128M" };

describe("startExpressCheckout", () => {
  it("creates a Stripe session and returns the redirect URL for a Hasbro-only cart with a Locker", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result).toEqual({ ok: true, redirectUrl: EXPRESS_SESSION_URL });
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    // The session must declare express mode
    expect(input.express).toBe(true);
    // Stripe, not the site, collects the address: no contact in the order
    expect(input.order).not.toHaveProperty("contact");
    // Updated 2026-10-23: quoted with the cart's own method, the InPost Locker; express no longer forces Poste home.
    expect(input.quote.shippingCode).toBe("inpost-locker");
    // The Locker picked in the cart, with InPost's id, goes to the session builder.
    expect(input.order).toMatchObject(LOCKER);
  });

  it("passes the idempotency key through to the session builder", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.order.idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it("accepts a Locker typed by hand: its name goes through, without an InPost id", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      pickupPoint: "Locker Roma Termini",
    });

    expect(result).toEqual({ ok: true, redirectUrl: EXPRESS_SESSION_URL });
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.order.pickupPoint).toBe("Locker Roma Termini");
    expect(input.order.pickupPointId).toBeUndefined();
  });

  it("asks for the Locker when the cart has none, instead of paying with nowhere to send the parcel", async () => {
    const lines = [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }];

    expect(await startExpressCheckout({ lines, idempotencyKey: IDEMPOTENCY_KEY })).toEqual({ ok: false, message: EXPRESS_LOCKER_MISSING_MESSAGE });
    // Fewer than three characters is no Locker either, blanks included.
    expect(await startExpressCheckout({ lines, idempotencyKey: IDEMPOTENCY_KEY, pickupPoint: "  ab  " })).toEqual({ ok: false, message: EXPRESS_LOCKER_MISSING_MESSAGE });
    expect(await startExpressCheckout({ lines, idempotencyKey: IDEMPOTENCY_KEY, pickupPoint: "   " })).toEqual({ ok: false, message: EXPRESS_LOCKER_MISSING_MESSAGE });
    // An id with no name is not a pick either.
    expect(await startExpressCheckout({ lines, idempotencyKey: IDEMPOTENCY_KEY, pickupPointId: LOCKER.pickupPointId })).toEqual({ ok: false, message: EXPRESS_LOCKER_MISSING_MESSAGE });
    expect(EXPRESS_LOCKER_MISSING_MESSAGE).toBe("Scegli il Locker InPost dove ritirare il pacco, poi paga.");
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  // Added 2026-10-23: the stadium box fits no Locker, so express sends it to the door with Poste.
  it("sends a stadium box to the door with Poste: no Locker needed, none passed on", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    const result = await startExpressCheckout({
      lines: [{ slug: "drop-attack-battle-set", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: true, redirectUrl: EXPRESS_SESSION_URL });
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.quote.shippingCode).toBe("standard");
    expect(input.order.pickupPoint).toBeUndefined();
    expect(input.order.pickupPointId).toBeUndefined();
  });

  it("drops a Locker the cart still holds when a stadium box sends the parcel to the door", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "sneak-attack-battle-set", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.quote.shippingCode).toBe("standard");
    expect(input.order.pickupPoint).toBeUndefined();
    expect(input.order.pickupPointId).toBeUndefined();
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

  // Owner, 2026-11-06: Takara Tomy pieces the shop bought itself leave from its own shelf.
  it("takes a cart of Takara Tomy pieces the shop owns, to the Locker the buyer picked", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: true, url: EXPRESS_SESSION_URL });

    const result = await startExpressCheckout({
      lines: [{ slug: "bx-48-random-booster-vol-9", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result.ok).toBe(true);
    const [input] = createStripeCheckoutMock.mock.calls[0]!;
    expect(input.quote.shippingCode).toBe("inpost-locker");
  });

  it("refuses a Takara-only cart (locked to the partner's Poste route)", async () => {
    // The Takara piece triggers the partner shipping plan: his parcel leaves his warehouse, so express cannot serve it.
    const result = await startExpressCheckout({
      lines: [{ slug: "ux-00-glory-valkyrie-lf", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: false, message: EXPRESS_CHECKOUT_LOCKED_MESSAGE });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a Takara-only cart even when it carries a Locker, with the locked message and not the Locker one", async () => {
    const result = await startExpressCheckout({
      lines: [{ slug: "ux-00-glory-valkyrie-lf", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result).toEqual({ ok: false, message: EXPRESS_CHECKOUT_LOCKED_MESSAGE });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  // Added 2026-10-23: a mixed cart is now locked to the InPost Locker (not poste-point), but still two warehouses.
  it("refuses a mixed Hasbro + Takara cart, which the plan locks to the Locker for the shop's parcel", async () => {
    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "ux-00-glory-valkyrie-lf", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result).toEqual({ ok: false, message: EXPRESS_CHECKOUT_LOCKED_MESSAGE });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a mixed cart that also holds a stadium box (bulky and mixed)", async () => {
    const result = await startExpressCheckout({
      lines: [{ slug: "drop-attack-battle-set", quantity: 1 }, { slug: "ux-00-glory-valkyrie-lf", quantity: 1 }],
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
    // A Locker id that is no InPost point id never reaches the quote.
    expect(
      await startExpressCheckout({ lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }], idempotencyKey: IDEMPOTENCY_KEY, pickupPoint: "Locker Roma Termini", pickupPointId: "roma" }),
    ).toEqual({ ok: false, message: "Il carrello contiene dati non validi. Ricarica la pagina." });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("stops during maintenance, before any payment page, like the regular checkout", async () => {
    useSwitches({ row: { maintenance_mode: true, accept_orders: true } });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/manutenzione/i) });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses when Stripe is not configured", async () => {
    stripeEnabledMock.mockReturnValue(false);

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result.ok).toBe(false);
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("surfaces the Stripe error message on session creation failure", async () => {
    createStripeCheckoutMock.mockResolvedValue({ ok: false, message: "Il pagamento non è disponibile." });

    const result = await startExpressCheckout({
      lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      ...LOCKER,
    });

    expect(result).toEqual({ ok: false, message: "Il pagamento non è disponibile." });
  });
});
