import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const placeOrderMock = vi.hoisted(() => vi.fn());
const quoteCartMock = vi.hoisted(() => vi.fn());
const providerNameMock = vi.hoisted(() => vi.fn(() => "supabase"));
const serverClientMock = vi.hoisted(() => vi.fn(async () => ({ marker: "request-scoped" })));

vi.mock("@/lib/commerce/order-intake", () => ({ placeOrder: placeOrderMock }));
vi.mock("@/lib/commerce/provider", () => ({
  getCommerceProvider: async () => ({ name: "test", quoteCart: quoteCartMock }),
  resolveCommerceProviderName: providerNameMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: serverClientMock }));

const { requestCartQuote, submitOrder } = await import("@/app/(storefront)/checkout/actions");

const contact = {
  email: "mario.rossi@email.it",
  firstName: "Mario",
  lastName: "Rossi",
  address: "Via Roma 1",
  city: "Milano",
  postalCode: "20121",
  province: "MI",
  phone: "+39 333 1234567",
  shippingMethod: "standard",
} as const;

const order = {
  contact,
  lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

beforeEach(() => {
  vi.clearAllMocks();
  providerNameMock.mockReturnValue("supabase");
  placeOrderMock.mockResolvedValue({ orderNumber: "GD-00000042", total: { amount: 5488, currency: "EUR" } });
});

describe("submitOrder", () => {
  it("registers the order and reports the number the database issued", async () => {
    const result = await submitOrder(order);

    expect(result).toEqual({
      ok: true,
      orderNumber: "GD-00000042",
      total: { amount: 5488, currency: "EUR" },
    });
  });

  it("uses the request-scoped client, so PostgreSQL sees the caller's identity", async () => {
    await submitOrder(order);

    expect(serverClientMock).toHaveBeenCalledOnce();
    expect(placeOrderMock.mock.calls[0]?.[0]).toEqual({ marker: "request-scoped" });
  });

  it("discards any price, total or customer id the browser attaches", async () => {
    await submitOrder({
      ...order,
      totalCents: 1,
      customerId: "00000000-0000-0000-0000-000000000009",
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 2, unitPriceCents: 1 }],
    } as never);

    const forwarded = placeOrderMock.mock.calls[0]?.[1];
    expect(forwarded).toEqual(order);
    expect(JSON.stringify(forwarded)).not.toMatch(/cents|customerId/i);
  });

  it("keeps the idempotency key the attempt started with", async () => {
    await submitOrder(order);
    await submitOrder(order);

    expect(placeOrderMock.mock.calls[0]?.[1].idempotencyKey).toBe(order.idempotencyKey);
    expect(placeOrderMock.mock.calls[1]?.[1].idempotencyKey).toBe(order.idempotencyKey);
  });

  it("refuses instead of faking a confirmation when no order backend is configured", async () => {
    providerNameMock.mockReturnValue("mock");

    const result = await submitOrder(order);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Gli ordini non sono ancora attivi");
    expect(placeOrderMock).not.toHaveBeenCalled();
  });

  it("translates a closed shop into a readable sentence", async () => {
    placeOrderMock.mockRejectedValue({ message: "GD_ORDER_INTAKE_DISABLED" });

    const result = await submitOrder(order);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Gli ordini non sono ancora attivi");
  });

  it("translates insufficient stock into a readable sentence", async () => {
    placeOrderMock.mockRejectedValue({ message: "GD_PRICING_PRODUCT_UNAVAILABLE" });

    const result = await submitOrder(order);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("non è più disponibile");
  });

  it("never leaks a raw database error", async () => {
    placeOrderMock.mockRejectedValue({ message: 'relation "public.orders" does not exist' });

    const result = await submitOrder(order);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).not.toMatch(/relation|public\.|SQLSTATE/);
  });

  it("rejects a malformed payload before touching the database", async () => {
    const result = await submitOrder({ ...order, idempotencyKey: "retry-1" } as never);

    expect(result.ok).toBe(false);
    expect(placeOrderMock).not.toHaveBeenCalled();
  });
});

describe("requestCartQuote", () => {
  it("asks the current provider to price the cart", async () => {
    quoteCartMock.mockResolvedValue({ orderable: true, lines: [] });

    await requestCartQuote({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }] });

    expect(quoteCartMock).toHaveBeenCalledWith({
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }],
    });
  });

  it("forwards the selected shipping code and coupon, and nothing else", async () => {
    quoteCartMock.mockResolvedValue({ orderable: true, lines: [] });

    await requestCartQuote({
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 1, unitPriceCents: 999 }],
      shippingCode: "standard",
      couponCode: "ESTATE",
    } as never);

    expect(quoteCartMock).toHaveBeenCalledWith({
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }],
      shippingCode: "standard",
      couponCode: "ESTATE",
    });
  });

  it("answers an empty cart without calling the provider", async () => {
    const quote = await requestCartQuote({ lines: [] });

    expect(quoteCartMock).not.toHaveBeenCalled();
    expect(quote.totals.total.amount).toBe(0);
    expect(quote.orderable).toBe(false);
  });

  it("reports a provider failure as a notice instead of throwing at the browser", async () => {
    quoteCartMock.mockRejectedValue({ message: "GD_PRICING_SHIPPING_INVALID" });

    const quote = await requestCartQuote({ lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }] });

    expect(quote.orderable).toBe(false);
    expect(quote.notice).toContain("spedizione");
    expect(quote.totals.total.amount).toBe(0);
  });

  it("does not price a cart whose lines are malformed", async () => {
    const quote = await requestCartQuote({ lines: [{ slug: "x", quantity: 99 }] } as never);

    expect(quoteCartMock).not.toHaveBeenCalled();
    expect(quote.orderable).toBe(false);
  });
});

describe("checkout action boundaries", () => {
  const source = readFileSync(join(process.cwd(), "src/app/(storefront)/checkout/actions.ts"), "utf8");

  it("is a server action module", () => {
    expect(source.startsWith('"use server"')).toBe(true);
  });

  it("never reaches for the privileged client", () => {
    // A service-role client authenticates as nobody, which is exactly how every order
    // ended up filed as a guest order.
    expect(source).not.toContain("createPrivilegedSupabaseClient");
    expect(source).not.toContain("supabase/admin");
    expect(source).toContain("createSupabaseServerClient");
  });

  it("validates both entry points with the shared schemas", () => {
    expect(source).toContain("placeOrderSchema.safeParse");
    expect(source).toContain("cartQuoteSchema.safeParse");
  });
});
