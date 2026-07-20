import { describe, expect, it, vi } from "vitest";
import { createSupabaseCommerceProvider } from "@/lib/commerce/supabase-provider";
import { PRODUCTS } from "@/data/catalog";

type Result = { data: unknown; error: unknown };

/** Chainable stand-in for the PostgREST builder: every filter returns `this`. */
function query(result: Result) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: async () => result,
    single: async () => result,
  };
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    chain[method] = () => chain;
  }
  return chain;
}

const SHIPPING = [
  { code: "standard", name: "Spedizione standard", price_cents: 490, free_from_cents: 5900, estimate_min_days: 1, estimate_max_days: 2 },
];

const PRODUCT_ROW = {
  id: 7,
  slug: "wizard-arrow-4-80b",
  name: "Wizard Arrow 4-80B",
  price_cents: 1999,
  stock_status: "disponibile",
  stock_quantity: 5,
  preorder_allocation: 0,
  availability_override: null,
  is_purchasable: true,
  images: [{ src: "/p.webp", width: 200, height: 180, alt: "P", sort_order: 0, is_primary: true, published: true }],
};

type Options = {
  readonly shipping?: readonly unknown[];
  readonly acceptOrders?: boolean;
  readonly products?: readonly unknown[];
  readonly pricing?: Result | readonly Result[];
};

function fakeProvider(options: Options = {}) {
  const pricingResults = Array.isArray(options.pricing)
    ? [...(options.pricing as Result[])]
    : [
        (options.pricing as Result | undefined) ?? {
          data: {
            subtotal_cents: 3998,
            discount_cents: 0,
            shipping_cents: 490,
            total_cents: 4488,
            coupon_code: null,
          },
          error: null,
        },
      ];

  const rpc = vi.fn(
    async (_name: string, _args: Record<string, unknown>) =>
      pricingResults.shift() ?? { data: null, error: { message: "exhausted" } },
  );
  const from = vi.fn((table: string) => {
    if (table === "shipping_methods") return query({ data: options.shipping ?? SHIPPING, error: null });
    if (table === "site_settings") {
      return query({ data: { accept_orders: options.acceptOrders ?? true }, error: null });
    }
    return query({ data: options.products ?? [PRODUCT_ROW], error: null });
  });

  return { provider: createSupabaseCommerceProvider({ from, rpc } as never), rpc };
}

const cart = { lines: [{ slug: "wizard-arrow-4-80b" as never, quantity: 2 }] };

describe("Supabase quoteCart", () => {
  it("prices from the database, not from the bundled catalogue", async () => {
    const { provider } = fakeProvider();
    const quote = await provider.quoteCart(cart);

    const staticPrice = PRODUCTS.find((p) => p.slug === "wizard-arrow-4-80b")?.price.amount;
    expect(staticPrice).toBe(2499);
    // The row says 19,99. The static catalogue must lose.
    expect(quote.lines[0]?.unitPrice.amount).toBe(1999);
    expect(quote.lines[0]?.lineTotal.amount).toBe(3998);
    expect(quote.totals.subtotal.amount).toBe(3998);
    expect(quote.totals.total.amount).toBe(4488);
  });

  it("sends the pricing RPC identifiers and quantities only", async () => {
    const { provider, rpc } = fakeProvider();
    await provider.quoteCart(cart);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args["p_lines"]).toEqual([{ product_id: 7, quantity: 2 }]);
    expect(JSON.stringify(args)).not.toMatch(/cents|price|total/i);
  });

  it("offers only the methods the shop sells, with their real prices", async () => {
    const { provider } = fakeProvider();
    const quote = await provider.quoteCart(cart);

    expect(quote.shippingOptions).toEqual([
      { code: "standard", label: "Spedizione standard", hint: "Consegna in 1-2 giorni", price: { amount: 490, currency: "EUR" } },
    ]);
    expect(quote.freeShippingThreshold).toBe(5900);
  });

  it("survives a shop with no active shipping method instead of throwing", async () => {
    // The seed ships `standard` inactive, so this is the state of a fresh database.
    const { provider, rpc } = fakeProvider({ shipping: [] });
    const quote = await provider.quoteCart(cart);

    expect(quote.shippingOptions).toEqual([]);
    expect(quote.shippingCode).toBeNull();
    expect(quote.orderable).toBe(false);
    expect(quote.notice).toContain("Nessun metodo di spedizione");
    expect(quote.totals.total.amount).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a closed shop without inventing a reason", async () => {
    const { provider } = fakeProvider({ acceptOrders: false });
    const quote = await provider.quoteCart(cart);

    expect(quote.orderIntake).toBe("closed");
    expect(quote.orderable).toBe(false);
    expect(quote.notice).toContain("Gli ordini non sono al momento attivi");
    // Prices are still authoritative: the customer may browse the real total.
    expect(quote.totals.subtotal.amount).toBe(3998);
  });

  it("names the line that blocks the cart and keeps it out of the pricing call", async () => {
    const { provider, rpc } = fakeProvider({
      products: [{ ...PRODUCT_ROW, stock_quantity: 1 }],
      pricing: [{ data: null, error: { message: "GD_PRICING_INVALID_LINES" } }],
    });
    const quote = await provider.quoteCart(cart);

    expect(quote.lines[0]?.issue).toBe("Disponibilità insufficiente: ne restano 1.");
    expect(quote.orderable).toBe(false);
    // Nothing sellable is left, so the RPC is never asked to price an empty cart.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("measures a preorder line against its allocation, not against stock", async () => {
    const { provider } = fakeProvider({
      products: [
        { ...PRODUCT_ROW, stock_quantity: 0, availability_override: "preorder", preorder_allocation: 1, stock_status: "pre-ordine" },
      ],
    });
    const quote = await provider.quoteCart(cart);

    expect(quote.lines[0]?.issue).toBe("Disponibilità insufficiente: ne restano 1.");
  });

  it("marks an unpurchasable product rather than pricing it", async () => {
    const { provider } = fakeProvider({ products: [{ ...PRODUCT_ROW, is_purchasable: false }] });
    const quote = await provider.quoteCart(cart);

    expect(quote.lines[0]?.issue).toBe("Non disponibile: rimuovilo per procedere.");
  });

  it("lists a slug that no longer resolves instead of dropping it silently", async () => {
    const { provider } = fakeProvider({ products: [] });
    const quote = await provider.quoteCart(cart);

    expect(quote.missingSlugs).toEqual(["wizard-arrow-4-80b"]);
    expect(quote.lines).toEqual([]);
    expect(quote.orderable).toBe(false);
  });

  it("re-prices without a rejected coupon so the cart still shows a total", async () => {
    const { provider, rpc } = fakeProvider({
      pricing: [
        { data: null, error: { message: "GD_PRICING_COUPON_INVALID" } },
        { data: { subtotal_cents: 3998, discount_cents: 0, shipping_cents: 490, total_cents: 4488, coupon_code: null }, error: null },
      ],
    });
    const quote = await provider.quoteCart({ ...cart, couponCode: "NONESISTE" });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(quote.couponError).toContain("codice sconto");
    expect(quote.couponCode).toBeNull();
    expect(quote.totals.total.amount).toBe(4488);
    expect(quote.orderable).toBe(true);
  });

  it("reports a pricing failure as a notice rather than a thrown driver error", async () => {
    const { provider } = fakeProvider({
      pricing: [{ data: null, error: { message: "GD_PRICING_TOTAL_TOO_LARGE" } }],
    });
    const quote = await provider.quoteCart(cart);

    expect(quote.orderable).toBe(false);
    expect(quote.notice).toContain("supera il massimo");
    expect(quote.totals.total.amount).toBe(0);
  });

  it("refuses to publish totals that are not safe integers", async () => {
    const { provider } = fakeProvider({
      pricing: [{ data: { subtotal_cents: "abc", discount_cents: 0, shipping_cents: 0, total_cents: 0 }, error: null }],
    });

    await expect(provider.quoteCart(cart)).rejects.toThrow("Totali autorevoli non validi");
  });
});
