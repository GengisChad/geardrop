/**
 * A coupon for first orders (owner, 2026-11-06: 5% from €50, once per customer). A customer here is an
 * email: the cart shows the discount, the checkout form checks the email before Stripe, and express
 * checkout steps aside because Stripe asks for the email after the price is fixed.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClubCodeField } from "@/components/cart/club-code";
import { readSiteCoupon, type BuyerHistory, type SiteCouponLookup } from "@/lib/commerce/cart-code";
import type { CartQuote } from "@/lib/commerce/types";
import type * as StripeCheckoutModule from "@/lib/payments/stripe-checkout";

const createStripeCheckoutMock = vi.hoisted(() => vi.fn());
const history = vi.hoisted(() => ({ value: new Map<string, { orders: number; ordersWithCode: number }>() }));
const seenEmails = vi.hoisted(() => [] as (string | undefined)[]);

const ROW = {
  code: "PRIMOTEST5",
  discount_kind: "percentage" as const,
  discount_value: 5,
  free_shipping: false,
  minimum_subtotal_cents: 5000,
  maximum_discount_cents: null,
  usage_limit: null,
  per_customer_limit: 1,
  first_purchase_only: true,
  starts_at: null,
  expires_at: null,
  active: true,
  disabled_at: null,
};
const TARGETS = { productSlugs: [], categorySlugs: [], bundleSlugs: [] };
const NOW = new Date("2026-11-06T12:00:00Z");

vi.mock("@/lib/commerce/provider", async () => {
  const { createMockProvider } = await import("@/lib/commerce/mock-provider");
  const { readSiteCoupon: read } = await import("@/lib/commerce/cart-code");
  return {
    resolveCommerceProviderName: () => "mock",
    getCommerceProvider: async () =>
      createMockProvider(undefined, async (code: string, email?: string): Promise<SiteCouponLookup> => {
        seenEmails.push(email);
        if (code !== ROW.code) return { status: "unknown" };
        return read(ROW, TARGETS, 0, NOW, email ? (history.value.get(email) ?? { orders: 0, ordersWithCode: 0 }) : null);
      }),
  };
});
vi.mock("@/lib/payments/stripe-checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeCheckoutModule>()),
  stripeCheckoutEnabled: () => true,
  createStripeCheckout: createStripeCheckoutMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://localhost:3000" }) }));
vi.mock("@/lib/commerce/order-intake", () => ({ placeOrder: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const { requestCartQuote, startExpressCheckout, submitOrder } = await import("@/app/(storefront)/checkout/actions");
const { EXPRESS_CODE_NEEDS_EMAIL_MESSAGE } = await import("@/lib/payments/express-checkout");

const BIG_ENOUGH = [{ slug: "glory-valkerion-lf", quantity: 3 }];
const NEW_BUYER = "nuovo@email.it";
const OLD_BUYER = "cliente@email.it";

const order = (email: string, lines = BIG_ENOUGH) => ({
  contact: {
    email,
    firstName: "Mario",
    lastName: "Rossi",
    address: "Via Roma 1",
    city: "Milano",
    postalCode: "20121",
    province: "MI",
    phone: "+39 333 1234567",
    shippingMethod: "inpost-locker",
    pickupPoint: "Locker Milano Centrale",
  },
  lines,
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
  couponCode: ROW.code,
});

beforeEach(() => {
  vi.clearAllMocks();
  seenEmails.length = 0;
  history.value = new Map([[OLD_BUYER, { orders: 2, ordersWithCode: 0 }]]);
  createStripeCheckoutMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5f6" });
});

describe("in the cart, before the email is known", () => {
  it("shows the discount and says what it waits for", async () => {
    const quote = await requestCartQuote({ lines: BIG_ENOUGH, couponCode: ROW.code });
    expect(quote.couponCode).toBe(ROW.code);
    expect(quote.totals.discount.amount).toBeGreaterThan(0);
    expect(quote.couponBuyerNote).toBe("Vale solo sul primo ordine: controlliamo l'email quando vai al pagamento.");
  });

  it("holds from its minimum, like any code", async () => {
    const quote = await requestCartQuote({ lines: [{ slug: "glory-valkerion-lf", quantity: 1 }], couponCode: ROW.code });
    expect(quote.couponCode).toBeNull();
    expect(quote.couponBuyerNote).toBeUndefined();
    expect(quote.couponError).toContain("Il codice vale da €50,00");
  });

  it("tells the buyer in the code field", () => {
    const html = renderToStaticMarkup(
      createElement(ClubCodeField, {
        quote: { couponCode: ROW.code, couponError: null, couponBuyerNote: "Vale solo sul primo ordine.", lines: [{ clubUnitPrice: { amount: 1899, currency: "EUR" } }] } as unknown as CartQuote,
      }),
    );
    expect(html).toContain("Sconto attivo");
    expect(html).toContain("Vale solo sul primo ordine.");
  });

  it("takes the express button away, in the cart and on the server", async () => {
    expect(readFileSync("src/app/(storefront)/carrello/cart-client.tsx", "utf8")).toContain("!quote.couponBuyerNote");
    const result = await startExpressCheckout({
      lines: BIG_ENOUGH,
      idempotencyKey: "9f8e7d6c-5b4a-4321-8765-a1b2c3d4e5f6",
      couponCode: ROW.code,
      pickupPoint: "Locker Milano Centrale",
    });
    expect(result).toEqual({ ok: false, message: EXPRESS_CODE_NEEDS_EMAIL_MESSAGE });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });
});

describe("at the checkout, with the email", () => {
  it("lets a new buyer pay at the discounted price", async () => {
    expect(await submitOrder(order(NEW_BUYER))).toMatchObject({ ok: true });
    expect(seenEmails).toEqual([NEW_BUYER]);
    const { quote } = createStripeCheckoutMock.mock.calls[0]![0] as { quote: CartQuote };
    expect(quote.couponCode).toBe(ROW.code);
    expect(quote.totals.discount.amount).toBeGreaterThan(0);
    expect(quote.couponBuyerNote).toBeUndefined();
  });

  it("refuses an email that already has an order, and sends nobody to Stripe", async () => {
    expect(await submitOrder(order(OLD_BUYER))).toEqual({
      ok: false,
      message: "Questo codice vale solo sul primo ordine: con questa email non si può usare.",
    });
    expect(createStripeCheckoutMock).not.toHaveBeenCalled();
  });

  it("leaves a cart without a code alone, whatever the email has bought", async () => {
    const { contact, lines, idempotencyKey } = order(OLD_BUYER);
    expect(await submitOrder({ contact, lines, idempotencyKey })).toMatchObject({ ok: true });
    expect(seenEmails).toEqual([]);
  });
});

describe("the rules", () => {
  const read = (changes: Partial<typeof ROW>, buyer: BuyerHistory | null) => readSiteCoupon({ ...ROW, ...changes }, TARGETS, 0, NOW, buyer);

  it("a first-order coupon counts every live order of that email, with or without the code", () => {
    expect(read({}, { orders: 0, ordersWithCode: 0 }).status).toBe("valid");
    expect(read({}, { orders: 1, ordersWithCode: 0 }).status).toBe("not-first-order");
  });

  it("a limit per customer counts only the orders that carry the code", () => {
    const once = { first_purchase_only: false };
    expect(read(once, { orders: 5, ordersWithCode: 0 }).status).toBe("valid");
    expect(read(once, { orders: 5, ordersWithCode: 1 }).status).toBe("used-by-buyer");
    expect(read({ first_purchase_only: false, per_customer_limit: 2 }, { orders: 5, ordersWithCode: 1 }).status).toBe("valid");
  });

  it("names the limit while the email is not known", () => {
    const note = (changes: Partial<typeof ROW>) => {
      const found = read(changes, null);
      return found.status === "valid" ? found.coupon.buyerNote : null;
    };
    expect(note({})).toContain("primo ordine");
    expect(note({ first_purchase_only: false })).toBe("Vale una volta per cliente: controlliamo l'email quando vai al pagamento.");
    expect(note({ first_purchase_only: false, per_customer_limit: 3 })).toContain("Vale 3 volte per cliente");
    expect(note({ first_purchase_only: false, per_customer_limit: null as unknown as number })).toBeNull();
  });

  it("drops the note once the email is known", () => {
    const found = read({}, { orders: 0, ordersWithCode: 0 });
    expect(found.status === "valid" ? found.coupon.buyerNote : "not valid").toBeNull();
  });

  it("an inactive coupon stays off whoever asks", () => {
    expect(read({ active: false }, { orders: 0, ordersWithCode: 0 }).status).toBe("inactive");
    expect(read({ active: false }, null).status).toBe("inactive");
  });
});
