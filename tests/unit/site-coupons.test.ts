/**
 * Coupons made on the site, in /admin/coupon (owner, 2026-11-06): the code goes in the cart's own
 * field, the cart shows the discount, and Stripe charges exactly that.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreeShippingMeter } from "@/components/cart/cart-summary";
import { ClubCodeField } from "@/components/cart/club-code";
import { BUNDLES, DECK_CASE_WITH_KIT, FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_METHODS } from "@/data/catalog";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import { readSiteCoupon, resolveCartCode, type CodeLine, type FindSiteCoupon, type SiteCoupon } from "@/lib/commerce/cart-code";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { findSiteCoupon } from "@/lib/commerce/site-coupons";
import type { CartQuote, CartQuoteRequest } from "@/lib/commerce/types";
import { paidCheckoutFromStripe } from "@/lib/orders/stripe-order";
import { stripeProductId } from "@/lib/payments/stripe-api";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe, type StripePriceRow } from "@/lib/payments/stripe-checkout";

const supabase = vi.hoisted(() => ({
  coupon: { data: null as unknown, error: null as unknown },
  orders: { count: 0 as number | null, error: null as unknown },
  // What the orders table answers once the query names a buyer, and that buyer's use of the code.
  buyerOrders: { count: 0 as number | null, error: null as unknown },
  buyerOrdersWithCode: { count: 0 as number | null, error: null as unknown },
  emails: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => {
  const builder = (table: string) => {
    const filters = new Map<string, unknown>();
    const result = () => {
      if (table === "coupons") return supabase.coupon;
      if (!filters.has("email")) return supabase.orders;
      supabase.emails.push(String(filters.get("email")));
      return filters.has("coupon_code") ? supabase.buyerOrdersWithCode : supabase.buyerOrders;
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.set(column, value);
        return chain;
      },
      neq: () => chain,
      abortSignal: () => chain,
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
    };
    return chain;
  };
  return { createPrivilegedSupabaseClient: () => ({ from: builder }) };
});

const flat15: SiteCoupon = {
  code: "CLUBTEST15",
  discountKind: "percentage",
  discountValue: 15,
  freeShipping: false,
  minimumSubtotalCents: 10000,
  maximumDiscountCents: null,
  productSlugs: [],
  categorySlugs: [],
  bundleSlugs: [],
  buyerNote: null,
};

const finding = (coupon: SiteCoupon): FindSiteCoupon => async (code) => (code === coupon.code ? { status: "valid", coupon } : { status: "unknown" });
const product = (slug: string) => PRODUCTS.find((candidate) => candidate.slug === slug)!;
const priceOf = (slug: string) => product(slug).price.amount;

async function quote(coupon: SiteCoupon, lines: readonly { slug: string; quantity: number }[], couponCode = coupon.code) {
  return createMockProvider(undefined, finding(coupon)).quoteCart({ lines, couponCode } as CartQuoteRequest);
}
const line = (priced: CartQuote, slug: string) => priced.lines.find((candidate) => candidate.slug === slug)!;

const BIG_CART = [
  { slug: "soar-phoenix-9-60gf", quantity: 2 },
  { slug: "bx-48-random-booster-vol-9", quantity: 2 },
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a flat coupon in the cart", () => {
  it("takes its percentage off every line, the new Takara pieces and the kits included", async () => {
    const kit = BUNDLES[0]!.slug;
    const priced = await quote(flat15, [...BIG_CART, { slug: kit, quantity: 1 }]);

    expect(priced.couponCode).toBe("CLUBTEST15");
    expect(priced.couponError).toBeNull();
    for (const slug of ["soar-phoenix-9-60gf", "bx-48-random-booster-vol-9", kit]) {
      const quoted = line(priced, slug);
      expect(quoted.clubUnitPrice?.amount, slug).toBe(Math.round((quoted.unitPrice.amount * 85) / 100));
    }
    const paid = priced.lines.reduce((sum, quoted) => sum + quoted.clubUnitPrice!.amount * quoted.quantity, 0);
    expect(priced.totals.subtotal.amount - priced.totals.discount.amount).toBe(paid);
    expect(priced.totals.total.amount).toBe(paid + priced.totals.shipping.amount);
  });

  it("is read whatever the case and the spacing", async () => {
    const seen: string[] = [];
    const provider = createMockProvider(undefined, async (code) => {
      seen.push(code);
      return { status: "valid", coupon: flat15 };
    });
    const priced = await provider.quoteCart({ lines: [...BIG_CART], couponCode: "  clubtest15 " } as CartQuoteRequest);
    expect(seen).toEqual(["CLUBTEST15"]);
    expect(priced.couponCode).toBe("CLUBTEST15");
  });

  it("under its minimum does nothing, and says how much is missing", async () => {
    const priced = await quote(flat15, [{ slug: "glory-valkerion-lf", quantity: 2 }]);
    const missing = 10000 - 2 * priceOf("glory-valkerion-lf");

    expect(priced.couponCode).toBeNull();
    expect(priced.couponError).toBe(`Il codice vale da €100,00 di ordine: ne mancano €${(missing / 100).toFixed(2).replace(".", ",")}.`);
    expect(priced.totals.discount.amount).toBe(0);
    expect(priced.lines[0]?.clubUnitPrice).toBeUndefined();
  });

  it("never takes free shipping away from a cart that had it", async () => {
    const lines = [{ slug: "bx-48-random-booster-vol-9", quantity: 3 }];
    const priced = await quote(flat15, lines);
    const paid = priced.totals.subtotal.amount - priced.totals.discount.amount;

    expect(priced.totals.subtotal.amount).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(paid).toBeLessThan(FREE_SHIPPING_THRESHOLD);
    expect(priced.totals.shipping.amount).toBe(0);
    expect(priced.totals.freeShippingRemaining).toBe(0);
  });

  it("does not bring free shipping forward either", async () => {
    const small = { ...flat15, minimumSubtotalCents: 0 };
    const priced = await quote(small, [{ slug: "glory-valkerion-lf", quantity: 2 }]);

    expect(priced.totals.discount.amount).toBeGreaterThan(0);
    expect(priced.totals.shipping.amount).toBe(SHIPPING_METHODS[0]!.priceCents);
    expect(priced.totals.freeShippingRemaining).toBe(FREE_SHIPPING_THRESHOLD - priced.totals.subtotal.amount);
  });

  it("takes a deck case at the kit price down from that price", async () => {
    const kit = BUNDLES[0]!.slug;
    const priced = await quote(flat15, [
      { slug: kit, quantity: 3 },
      { slug: "porta-deck-giallo", quantity: 1 },
    ]);
    const deck = line(priced, "porta-deck-giallo");

    expect(deck.kitUnitPrice?.amount).toBe(DECK_CASE_WITH_KIT);
    expect(deck.clubUnitPrice?.amount).toBe(Math.round((DECK_CASE_WITH_KIT * 85) / 100));
    expect(priced.totals.subtotal.amount - priced.totals.discount.amount).toBe(
      priced.lines.reduce((sum, quoted) => sum + quoted.clubUnitPrice!.amount * quoted.quantity, 0),
    );
  });

  it("leaves the partner's piece at his price", async () => {
    const partner = PRODUCTS.find((candidate) => candidate.consignment)!;
    const priced = await quote(flat15, [...BIG_CART, { slug: partner.slug, quantity: 1 }]);

    expect(line(priced, partner.slug).clubUnitPrice).toBeUndefined();
    expect(line(priced, "soar-phoenix-9-60gf").clubUnitPrice).toBeDefined();
  });
});

describe("a club's 15% on the whole catalogue (owner, 2026-11-06)", () => {
  const catalogue = [...PRODUCTS, ...BUNDLES];
  const asLines = (products: typeof catalogue): CodeLine[] =>
    products.map((candidate) => ({
      slug: candidate.slug,
      quantity: 1,
      price: candidate.price,
      category: candidate.category,
      consignment: Boolean(candidate.consignment),
    }));
  const pricesOf = async (lines: readonly CodeLine[]) => {
    const code = await resolveCartCode(flat15.code, finding(flat15));
    if (!code || !("pricing" in code)) throw new Error("the coupon should hold");
    return code.pricing.unitPrices(lines);
  };

  it("takes 15% off everything the shop owns, with no list to keep", async () => {
    const owned = catalogue.filter((candidate) => !candidate.consignment);
    const prices = await pricesOf(asLines(owned));
    expect(owned.length).toBeGreaterThan(40);
    for (const candidate of owned) {
      expect(prices.get(candidate.slug)?.amount, candidate.slug).toBe(Math.round((candidate.price.amount * 85) / 100));
    }
  });

  it("covers a product added tomorrow", async () => {
    const tomorrow: CodeLine = { slug: "nuovo-arrivo-di-domani", quantity: 1, price: { amount: 2000, currency: "EUR" }, category: "beyblade-x", consignment: false };
    expect((await pricesOf([tomorrow])).get(tomorrow.slug)?.amount).toBe(1700);
  });

  it("leaves the partner's pieces out: he is owed his price, and the commission could not carry it", async () => {
    const partner = catalogue.filter((candidate) => candidate.consignment);
    expect(partner.length).toBeGreaterThan(0);
    for (const candidate of partner) {
      expect((candidate.price.amount * 15) / 100, candidate.slug).toBeGreaterThan(candidate.commissionCents!);
    }
    expect((await pricesOf(asLines(partner))).size).toBe(0);
  });

  it("files the paid order under the code, read from the product id", () => {
    const checkout = paidCheckoutFromStripe(
      {
        id: "cs_live_a1b2c3d4e5f6",
        created: 1_792_000_000,
        payment_status: "paid",
        client_reference_id: "GD-CLUB0001",
        customer_details: { email: "club@email.it" },
        metadata: { club: "CLUBTEST15" },
        amount_total: 12702,
        total_details: { amount_shipping: 0, amount_discount: 0 },
      },
      [{ description: "Soar Phoenix 9-60GF", quantity: 6, price: { lookup_key: null, unit_amount: 2117, product: "gd_soar_phoenix_9_60gf" } }],
    );
    expect(checkout?.couponCode).toBe("CLUBTEST15");
    expect(checkout?.lines).toEqual([{ slug: "soar-phoenix-9-60gf", name: "Soar Phoenix 9-60GF", quantity: 6, unitPriceCents: 2117 }]);
  });
});

describe("what the admin form can set", () => {
  it("covers only the products it names", async () => {
    const priced = await quote({ ...flat15, productSlugs: ["soar-phoenix-9-60gf"] }, BIG_CART);
    expect(line(priced, "soar-phoenix-9-60gf").clubUnitPrice).toBeDefined();
    expect(line(priced, "bx-48-random-booster-vol-9").clubUnitPrice).toBeUndefined();
  });

  it("covers only the categories it names", async () => {
    const priced = await quote({ ...flat15, categorySlugs: ["lanciatori"] }, [...BIG_CART, { slug: "winder-launcher-takara-tomy", quantity: 1 }]);
    expect(line(priced, "winder-launcher-takara-tomy").clubUnitPrice).toBeDefined();
    expect(line(priced, "soar-phoenix-9-60gf").clubUnitPrice).toBeUndefined();
  });

  it("stays valid on a cart it does not cover, and takes nothing off", async () => {
    const priced = await quote({ ...flat15, productSlugs: ["glory-valkerion-lf"] }, BIG_CART);
    expect(priced.couponCode).toBe("CLUBTEST15");
    expect(priced.couponError).toBeNull();
    expect(priced.totals.discount.amount).toBe(0);
  });

  it("spreads a fixed amount over the lines it covers", async () => {
    const priced = await quote({ ...flat15, discountKind: "fixed", discountValue: 1000 }, BIG_CART);
    // Rounded per unit, as Stripe charges it: within a cent per unit of the amount set.
    expect(Math.abs(priced.totals.discount.amount - 1000)).toBeLessThanOrEqual(4);
  });

  it("stops at the maximum discount", async () => {
    const priced = await quote({ ...flat15, maximumDiscountCents: 500 }, BIG_CART);
    expect(Math.abs(priced.totals.discount.amount - 500)).toBeLessThanOrEqual(4);
  });

  it("gives free shipping when it says so, once its minimum is met", async () => {
    const free = { ...flat15, minimumSubtotalCents: 0, freeShipping: true };
    const priced = await quote(free, [{ slug: "glory-valkerion-lf", quantity: 1 }]);
    expect(priced.totals.shipping.amount).toBe(0);
    expect(priced.totals.freeShippingRemaining).toBe(0);
  });
});

describe("refusals", () => {
  const refusing = (status: "inactive" | "unavailable" | "unknown") =>
    createMockProvider(undefined, async () => ({ status })).quoteCart({ lines: [...BIG_CART], couponCode: "QUALCOSA" } as CartQuoteRequest);

  it.each([
    ["unknown", "Codice non valido."],
    ["inactive", "Questo codice non è attivo."],
    ["unavailable", "Non riesco a controllare il codice: riprova tra poco."],
  ] as const)("%s reads as a refusal, at full price", async (status, message) => {
    const priced = await refusing(status);
    expect(priced.couponCode).toBeNull();
    expect(priced.couponError).toBe(message);
    expect(priced.totals.discount.amount).toBe(0);
  });
});

describe("whether a coupon holds", () => {
  const NOW = new Date("2026-11-06T12:00:00Z");
  const TARGETS = { productSlugs: [], categorySlugs: [], bundleSlugs: [] };
  const row = {
    code: "CLUBTEST15",
    discount_kind: "percentage" as const,
    discount_value: 15,
    free_shipping: false,
    minimum_subtotal_cents: 10000,
    maximum_discount_cents: null,
    usage_limit: null,
    per_customer_limit: null,
    first_purchase_only: false,
    starts_at: null,
    expires_at: null,
    active: true,
    disabled_at: null,
  };
  const status = (changes: Partial<typeof row> | Record<string, unknown>, used = 0) =>
    readSiteCoupon({ ...row, ...changes } as typeof row, TARGETS, used, NOW).status;

  it("holds when it is active and open to anyone", () => {
    expect(readSiteCoupon(row, TARGETS, 0, NOW)).toEqual({ status: "valid", coupon: flat15 });
  });

  it.each([
    ["switched off", { active: false }],
    ["disabled", { disabled_at: "2026-11-01T00:00:00Z" }],
    ["not started", { starts_at: "2026-12-01T00:00:00Z" }],
    ["expired", { expires_at: "2026-11-01T00:00:00Z" }],
  ])("does not hold when %s", (_name, changes) => {
    expect(status(changes)).toBe("inactive");
  });

  it("holds inside its dates", () => {
    expect(status({ starts_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" })).toBe("valid");
  });

  it("stops at its usage limit", () => {
    expect(status({ usage_limit: 2 }, 1)).toBe("valid");
    expect(status({ usage_limit: 2 }, 2)).toBe("inactive");
  });
});

describe("on Stripe", () => {
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
      shippingMethod: "inpost-locker",
      pickupPoint: "Locker di prova",
    },
    lines: [...BIG_CART],
    idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
  };
  const prices: StripePriceRow[] = PRODUCTS.map((candidate) => ({
    id: `price_${candidate.slug}`,
    lookup_key: stripeProductId(candidate.slug),
    unit_amount: candidate.price.amount,
    currency: "eur",
    active: true,
  }));
  const fieldsOf = (priced: CartQuote) => buildCheckoutSessionFields({ quote: priced, order, origin: "https://geardropshop.it" }, matchStripePrices(priced, prices)!);

  it("charges what the cart showed, under the code, with no second code on top", async () => {
    const priced = openQuoteForStripe(await quote(flat15, BIG_CART));
    const fields = fieldsOf(priced);
    const charged = priced.lines.reduce((sum, quoted, index) => {
      expect(fields[`line_items[${index}][price]`]).toBeUndefined();
      expect(fields[`line_items[${index}][price_data][product]`]).toBe(stripeProductId(quoted.slug));
      return sum + (fields[`line_items[${index}][price_data][unit_amount]`] as number) * quoted.quantity;
    }, 0);

    expect(charged).toBe(priced.totals.subtotal.amount - priced.totals.discount.amount);
    expect(fields["metadata[club]"]).toBe("CLUBTEST15");
    expect(fields["allow_promotion_codes"]).toBe("false");
    expect(fields["custom_text[submit][message]"]).toBe("Sconto applicato (CLUBTEST15).");
  });

  it("does not claim a discount the code did not give", async () => {
    const priced = openQuoteForStripe(await quote({ ...flat15, productSlugs: ["glory-valkerion-lf"] }, BIG_CART));
    expect(fieldsOf(priced)["custom_text[submit][message]"]).toBeUndefined();
  });
});

describe("reading a coupon from the database", () => {
  const stored = {
    ...{
      id: 7,
      code: "CLUBTEST15",
      discount_kind: "percentage",
      discount_value: 15,
      free_shipping: false,
      minimum_subtotal_cents: 10000,
      maximum_discount_cents: null,
      usage_limit: null,
      per_customer_limit: null,
      first_purchase_only: false,
      starts_at: null,
      expires_at: null,
      active: true,
      disabled_at: null,
    },
    coupon_products: [{ products: { slug: "soar-phoenix-9-60gf" } }],
    coupon_categories: [{ categories: { slug: "lanciatori" } }],
    coupon_bundles: [],
  };

  const load = () => findSiteCoupon("CLUBTEST15");

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
    supabase.coupon = { data: stored, error: null };
    supabase.orders = { count: 0, error: null };
    supabase.buyerOrders = { count: 0, error: null };
    supabase.buyerOrdersWithCode = { count: 0, error: null };
    supabase.emails = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the coupon with what it targets", async () => {
    expect(await load()).toEqual({
      status: "valid",
      coupon: { ...flat15, productSlugs: ["soar-phoenix-9-60gf"], categorySlugs: ["lanciatori"] },
    });
  });

  it("does not know a code that is not there", async () => {
    supabase.coupon = { data: null, error: null };
    expect(await load()).toEqual({ status: "unknown" });
  });

  it("ignores another organization's coupon", async () => {
    supabase.coupon = { data: { ...stored, organization_id: 2 }, error: null };
    expect(await load()).toEqual({ status: "unknown" });
    supabase.coupon = { data: { ...stored, organization_id: 1 }, error: null };
    expect((await load()).status).toBe("valid");
  });

  it("counts the orders that carry it against its limit", async () => {
    supabase.coupon = { data: { ...stored, usage_limit: 1 }, error: null };
    expect((await load()).status).toBe("valid");
    supabase.orders = { count: 1, error: null };
    expect((await load()).status).toBe("inactive");
  });

  it("says it could not check when the database fails, rather than calling the code invalid", async () => {
    supabase.coupon = { data: null, error: { message: "boom" } };
    expect(await load()).toEqual({ status: "unavailable" });
  });

  it("knows no coupon on a build without the server's key", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(await load()).toEqual({ status: "unknown" });
  });
});

describe("what the buyer reads", () => {
  const field = (lines: readonly object[]) =>
    renderToStaticMarkup(createElement(ClubCodeField, { quote: { couponCode: "CLUBTEST15", couponError: null, lines } as unknown as CartQuote }));

  it("names the discount when the code lowers something", () => {
    const html = field([{ clubUnitPrice: { amount: 1699, currency: "EUR" } }]);
    expect(html).toContain("Sconto attivo");
    expect(html).not.toContain("club-code-no-discount");
  });

  it("says so when the code is valid but lowers nothing in this cart", () => {
    const html = field([{}]);
    expect(html).toContain("Codice valido");
    expect(html).toContain("Su questi pezzi il codice non dà sconto.");
    expect(html).not.toContain("Sconto attivo");
  });

  it("asks for a discount code, not only a club's", () => {
    const html = renderToStaticMarkup(createElement(ClubCodeField, { quote: { couponCode: null, couponError: null, lines: [] } as unknown as CartQuote }));
    expect(html).toContain("Hai un codice sconto?");
  });

  it("lights the free-shipping rail on the server's measure, not on the discounted total", () => {
    const eur = (amount: number) => ({ amount, currency: "EUR" as const });
    // €95 before the code, €85,50 after it: the server says €5 are missing, so 19 of 20 teeth.
    const html = renderToStaticMarkup(
      createElement(FreeShippingMeter, {
        threshold: FREE_SHIPPING_THRESHOLD,
        totals: { subtotal: eur(9500), discount: eur(950), shipping: eur(490), total: eur(9040), freeShippingRemaining: 500 },
      }),
    );
    expect(html.split('data-lit="true"').length - 1).toBe(19);
  });
});

describe("reading a first-order coupon from the database", () => {
  const stored = {
    code: "PRIMOTEST5",
    discount_kind: "percentage",
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
    coupon_products: [],
    coupon_categories: [],
    coupon_bundles: [],
  };
  const load = (email?: string) => findSiteCoupon("PRIMOTEST5", email);

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
    supabase.coupon = { data: stored, error: null };
    supabase.buyerOrders = { count: 0, error: null };
    supabase.buyerOrdersWithCode = { count: 0, error: null };
    supabase.emails = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks nothing of the orders until the email is known, and says it waits for it", async () => {
    const found = await load();
    expect(found.status === "valid" ? found.coupon.buyerNote : "not valid").toContain("primo ordine");
    expect(supabase.emails).toEqual([]);
  });

  it("matches the email as orders store it, lowercased and trimmed", async () => {
    expect((await load("  Mario.Rossi@Email.IT ")).status).toBe("valid");
    expect(supabase.emails).toEqual(["mario.rossi@email.it", "mario.rossi@email.it"]);
  });

  it("refuses an email with an order", async () => {
    supabase.buyerOrders = { count: 1, error: null };
    expect(await load("cliente@email.it")).toEqual({ status: "not-first-order" });
  });

  it("refuses an email that used up its turns", async () => {
    supabase.coupon = { data: { ...stored, first_purchase_only: false }, error: null };
    supabase.buyerOrders = { count: 4, error: null };
    supabase.buyerOrdersWithCode = { count: 1, error: null };
    expect(await load("cliente@email.it")).toEqual({ status: "used-by-buyer" });
  });

  it("does not read the buyer's orders for a coupon open to anyone", async () => {
    supabase.coupon = { data: { ...stored, first_purchase_only: false, per_customer_limit: null }, error: null };
    expect((await load("cliente@email.it")).status).toBe("valid");
    expect(supabase.emails).toEqual([]);
  });

  it("says it could not check when the orders do not answer, rather than letting the code through", async () => {
    supabase.buyerOrders = { count: null, error: { message: "boom" } };
    expect(await load("cliente@email.it")).toEqual({ status: "unavailable" });
  });
});
