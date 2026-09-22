import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { LEGAL_PAGES, SUPPORT_PAGES } from "@/data/pages";
import { withBundles } from "@/lib/commerce/bundles";
import { applyLiveStock, type LiveStockRow } from "@/lib/commerce/live-stock-overlay";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import type { CartQuoteRequest, Product } from "@/lib/commerce/types";
import { availabilityLine } from "@/lib/holo";
import { PREORDER_DELIVERY, STOCK_HINT, preorderNote } from "@/lib/labels";
import { customerOrderEmail, ownerOrderEmail } from "@/lib/orders/order-email";
import { paidCheckoutFromStripe, parsePreorderMetadata, type PaidCheckout } from "@/lib/orders/stripe-order";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe } from "@/lib/payments/stripe-checkout";
import { stripeProductId } from "@/lib/payments/stripe-api";

const GLORY = "glory-valkerion-lf";
const HORUS = "shatter-horus-9-65gb";
const ENLIL = "hurricane-enlil-is-7-55t";
const DUO = "duo-horus-enlil";

/** The catalogue as the live overlay serves it, with every pack selling past its stock. */
function liveCatalogue(stock: Record<string, number>, allowBackorder = true): readonly Product[] {
  const rows: LiveStockRow[] = PRODUCTS.map((product) => {
    const quantity = stock[product.slug] ?? 10;
    return {
      slug: product.slug,
      stock_status: quantity > 0 ? "disponibile" : allowBackorder ? "pre-ordine" : "esaurito",
      stock_quantity: quantity,
      preorder_allocation: 0,
      availability_override: null,
      allow_backorder: allowBackorder,
    };
  });
  return withBundles(applyLiveStock(PRODUCTS, rows), BUNDLES);
}

async function quote(catalogue: readonly Product[], lines: CartQuoteRequest["lines"]) {
  return openQuoteForStripe(await createMockProvider(catalogue).quoteCart({ lines }));
}

describe("live stock with automatic pre-order", () => {
  it("turns a sold-out product into a pre-order that still sells", () => {
    const glory = liveCatalogue({ [GLORY]: 0 }).find((product) => product.slug === GLORY)!;
    expect(glory).toMatchObject({ stock: "pre-ordine", availableQuantity: 0, autoPreorder: true });
    expect(availabilityLine(glory)).toBe("Pre-ordine");
  });

  it("reads pre-order at zero even while the database still says sold out", () => {
    const [glory] = applyLiveStock(PRODUCTS.filter((product) => product.slug === GLORY), [
      { slug: GLORY, stock_status: "esaurito", stock_quantity: 0, preorder_allocation: 0, availability_override: null, allow_backorder: true },
    ]);
    expect(glory).toMatchObject({ stock: "pre-ordine", autoPreorder: true });
  });

  it("leaves products without the switch, and manual pre-orders, as they were", () => {
    const soldOut = liveCatalogue({ [GLORY]: 0 }, false).find((product) => product.slug === GLORY)!;
    expect(soldOut.stock).toBe("esaurito");
    expect(soldOut.autoPreorder).toBeUndefined();

    const [manual] = applyLiveStock(PRODUCTS.filter((product) => product.slug === GLORY), [
      { slug: GLORY, stock_status: "pre-ordine", stock_quantity: 0, preorder_allocation: 4, availability_override: "preorder", allow_backorder: true },
    ]);
    expect(manual).toMatchObject({ stock: "pre-ordine", availableQuantity: 4 });
    expect(manual!.autoPreorder).toBeUndefined();
  });

  it("puts the duo on pre-order when a pack runs out, and sells it out when a pack cannot wait", () => {
    const duo = liveCatalogue({ [HORUS]: 0 }).find((product) => product.slug === DUO)!;
    expect(duo).toMatchObject({ stock: "pre-ordine", availableQuantity: 0, autoPreorder: true });

    const closed = liveCatalogue({ [HORUS]: 0 }, false).find((product) => product.slug === DUO)!;
    expect(closed.stock).toBe("esaurito");
  });
});

describe("cart quote with automatic pre-order", () => {
  it("splits a line between the last pieces and a pre-order", async () => {
    const result = await quote(liveCatalogue({ [GLORY]: 1 }), [{ slug: GLORY, quantity: 3 }]);
    expect(result.orderable).toBe(true);
    expect(result.lines[0]).toMatchObject({ issue: null, availableQuantity: 1, autoPreorder: true, preorderQuantity: 2 });
    expect(preorderNote(result.lines[0]!)).toBe("2 in pre-ordine · potrebbe arrivare tra 10/15 giorni lavorativi");
  });

  it("sells a sold-out product whole as a pre-order", async () => {
    const result = await quote(liveCatalogue({ [GLORY]: 0 }), [{ slug: GLORY, quantity: 2 }]);
    expect(result.orderable).toBe(true);
    expect(result.lines[0]).toMatchObject({ stock: "pre-ordine", issue: null, preorderQuantity: 2 });
    expect(preorderNote(result.lines[0]!)).toBe("In pre-ordine · potrebbe arrivare tra 10/15 giorni lavorativi");
  });

  it("leaves in-stock lines alone", async () => {
    const result = await quote(liveCatalogue({ [GLORY]: 5 }), [{ slug: GLORY, quantity: 5 }]);
    expect(result.lines[0]!.preorderQuantity).toBeUndefined();
    expect(preorderNote(result.lines[0]!)).toBeNull();
  });

  it("still refuses more than the stock of a product that does not pre-order", async () => {
    const result = await quote(liveCatalogue({ [GLORY]: 1 }, false), [{ slug: GLORY, quantity: 2 }]);
    expect(result.orderable).toBe(false);
    expect(result.lines[0]!.issue).toBe("Disponibilità insufficiente: ne restano 1.");
  });

  it("hands the shelf out in cart order across the duo and a single pack", async () => {
    const catalogue = liveCatalogue({ [HORUS]: 1, [ENLIL]: 5 });

    const duoFirst = await quote(catalogue, [
      { slug: DUO, quantity: 1 },
      { slug: HORUS, quantity: 1 },
    ]);
    expect(duoFirst.lines.map((line) => line.preorderQuantity ?? 0)).toEqual([0, 1]);

    const packFirst = await quote(catalogue, [
      { slug: HORUS, quantity: 1 },
      { slug: DUO, quantity: 2 },
    ]);
    expect(packFirst.orderable).toBe(true);
    expect(packFirst.lines.map((line) => line.preorderQuantity ?? 0)).toEqual([0, 2]);
  });
});

describe("Stripe page for a pre-order", () => {
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
    },
    lines: [{ slug: GLORY, quantity: 3 }],
    idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
  };
  const prices = PRODUCTS.map((product) => ({
    id: `price_${product.slug}`,
    lookup_key: stripeProductId(product.slug),
    unit_amount: product.price.amount,
    currency: "eur",
    active: true,
  }));

  it("names the pre-ordered pieces next to the pay button and records them on the session", async () => {
    const result = await quote(liveCatalogue({ [GLORY]: 1 }), [{ slug: GLORY, quantity: 3 }]);
    const fields = buildCheckoutSessionFields({ quote: result, order, origin: "https://geardropshop.it" }, matchStripePrices(result, prices)!);
    expect(fields["custom_text[submit][message]"]).toBe(`In pre-ordine: 2 × Glory Valkerion LF. ${PREORDER_DELIVERY}.`);
    expect(fields["metadata[preorder]"]).toBe(`${GLORY} x2`);
    expect(fields["line_items[0][quantity]"]).toBe(3);
  });
});

describe("paid pre-orders in the emails", () => {
  const session = {
    id: "cs_live_a1B2c3D4e5F6g7H8",
    created: 1_789_560_960,
    payment_status: "paid",
    client_reference_id: "GD-PREORDER",
    customer_email: "buyer@example.com",
    amount_total: 9470,
    metadata: { order_ref: "GD-PREORDER", lines: `${GLORY} x3`, preorder: `${GLORY} x2` },
    customer_details: { email: "buyer@example.com", phone: null, name: null, address: null },
    total_details: { amount_shipping: 490 },
    payment_intent: {
      id: "pi_live_123",
      shipping: {
        name: "Mario Rossi",
        phone: "3331234567",
        address: { line1: "Via Roma 1", line2: null, postal_code: "34148", city: "Trieste", state: "TS", country: "IT" },
      },
    },
  };
  const items = [
    { description: "Glory Valkerion LF", quantity: 3, amount_subtotal: 8980, price: { lookup_key: "gd_glory_valkerion_lf", unit_amount: 2993, product: "gd_glory_valkerion_lf" } },
  ];
  const checkout = paidCheckoutFromStripe(session, items) as PaidCheckout;

  it("reads what the buyer was told before paying", () => {
    expect(checkout.announcedPreorder).toEqual({ [GLORY]: 2 });
    expect(parsePreorderMetadata(`${GLORY} x1, ${DUO} x2, nonsense`)).toEqual({ [GLORY]: 1, [DUO]: 2 });
    expect(parsePreorderMetadata(undefined)).toEqual({});
  });

  it("flags the pre-order to the owner, with a warning only when the buyer was not told", () => {
    const told = ownerOrderEmail(checkout, { id: 7, orderNumber: "GD-PREORDER", preorderQuantities: [2] });
    expect(told.subject.startsWith("[PRE-ORDINE] Nuovo ordine GD-PREORDER")).toBe(true);
    expect(told.html).toContain("PRE-ORDINE: 2 di 3");
    expect(told.html).toContain("Contiene un pre-ordine:</strong> 2 × Glory Valkerion LF");
    expect(told.text).toContain("CONTIENE UN PRE-ORDINE: 2 × Glory Valkerion LF");
    expect(told.html).not.toContain("non ha visto");

    const surprised = ownerOrderEmail(checkout, { id: 7, orderNumber: "GD-PREORDER", preorderQuantities: [3] });
    expect(surprised.html).toContain("PRE-ORDINE · non era a magazzino");
    expect(surprised.html).toContain("non ha visto l&#39;avviso di pre-ordine");

    const inStock = ownerOrderEmail(checkout, { id: 7, orderNumber: "GD-PREORDER", preorderQuantities: [0] });
    expect(inStock.subject.startsWith("Nuovo ordine")).toBe(true);
    expect(inStock.html).not.toContain("PRE-ORDINE");
  });

  it("tells the buyer how long the pre-ordered pieces may take, without owner notes", () => {
    const email = customerOrderEmail(checkout, { id: 7, orderNumber: "GD-PREORDER", preorderQuantities: [2] });
    expect(email.html).toContain("PRE-ORDINE: 2 di 3 · potrebbe arrivare tra 10/15 giorni lavorativi");
    expect(email.text).toContain("PRE-ORDINE: 2 di 3 · potrebbe arrivare tra 10/15 giorni lavorativi");
    expect(email.html).not.toContain("magazzino");
  });
});

describe("pre-order copy and database rule", () => {
  it("explains both waits wherever a pre-order is explained, and invents no third one", () => {
    // The legend cannot know which wait applies, so it points at the product instead of guessing.
    expect(STOCK_HINT["pre-ordine"]).toBe("Tempi indicati su ogni scheda prodotto");
    const policy = JSON.stringify([SUPPORT_PAGES, LEGAL_PAGES]);
    // A piece bought beyond the shelf, and a drop that is not out yet: the pages say both.
    expect(policy).toContain("10/15 giorni lavorativi");
    expect(policy).toContain("uscita Hasbro");
    expect(policy).toContain("20 giorni lavorativi");
    expect(policy).not.toContain("entro 14 giorni dalla conferma");

    const details = readFileSync(join(process.cwd(), "src/components/product/product-details.tsx"), "utf8");
    expect(details).toContain("10/15 giorni lavorativi");
    expect(details).toContain("uscita Hasbro");
    expect(details).not.toContain("14 giorni");

    // The success page cannot know what was bought, so it names no wait at all.
    const success = readFileSync(join(process.cwd(), "src/app/(storefront)/checkout/successo/page.tsx"), "utf8");
    expect(success).not.toContain("giorni lavorativi");
    expect(success).toContain("l'email di conferma indica per ognuno quando arriva");
  });

  it("switches at zero stock in the database and records pre-ordered units per line", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260917140000_auto_preorder_when_stock_runs_out.sql"), "utf8");
    expect(migration).toContain("when allow_backorder then 'pre-ordine'::public.stock_status");
    expect(migration).toContain("or (availability_override is null and allow_backorder)");
    expect(migration).toMatch(/set allow_backorder = true\s+where publication_status = 'published'/);
    expect(migration).toContain("check (preorder_quantity between 0 and quantity)");
    expect(migration).toContain("if short > 0 and not backorder then");
  });
});

describe("what a card says about a pre-order", () => {
  it("never passes an allocation off as pieces on the shelf", async () => {
    const { availabilityLine } = await import("@/lib/holo");
    expect(availabilityLine({ stock: "pre-ordine", availableQuantity: 9 })).toBe("Solo 9 in pre-ordine");
    expect(availabilityLine({ stock: "pre-ordine" })).toBe("Pre-ordine");
    expect(availabilityLine({ stock: "disponibile", availableQuantity: 9 })).toBe("Solo 9 pezzi");
    expect(availabilityLine({ stock: "disponibile", availableQuantity: 3, bundleOf: [] })).toBe("Solo 3 duo");
  });
});
