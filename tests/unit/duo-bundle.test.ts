import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLE, BUNDLES, PRODUCTS } from "@/data/catalog";
import { cutoutSrc, packBoxes, productImages } from "@/data/assets";
import { bundlesContaining, piecesOf, resolveBundle, withBundles } from "@/lib/commerce/bundles";
import { createMockProvider, STOREFRONT_CATALOGUE } from "@/lib/commerce/mock-provider";
import type { Product } from "@/lib/commerce/types";
import { availabilityLine } from "@/lib/holo";
import { paidCheckoutFromStripe, slugFromStripeId } from "@/lib/orders/stripe-order";
import { stripeOrderLines } from "@/lib/orders/supabase-order-store";
import { matchStripePrices } from "@/lib/payments/stripe-checkout";
import { buildStripePrice, buildStripeProduct, STRIPE_CATALOGUE } from "../../scripts/sync-stripe-products";

const duo = BUNDLES.find((bundle) => bundle.slug === "duo-horus-enlil")!;
const horus = PRODUCTS.find((product) => product.slug === "shatter-horus-9-65gb")!;
const enlil = PRODUCTS.find((product) => product.slug === "hurricane-enlil-is-7-55t")!;

function withStock(stock: Partial<Record<string, number>>): readonly Product[] {
  return PRODUCTS.map((product) =>
    stock[product.slug] === undefined
      ? product
      : { ...product, availableQuantity: stock[product.slug]!, stock: stock[product.slug] === 0 ? "esaurito" : "disponibile" },
  );
}

describe("the Horus + Enlil duo in the catalogue", () => {
  it("costs €33 against €36 for the two packs it ships", () => {
    expect(duo.price.amount).toBe(3300);
    expect(duo.compareAtPrice?.amount).toBe(horus.price.amount + enlil.price.amount);
    expect(duo.bundleOf).toEqual([
      { slug: "shatter-horus-9-65gb", quantity: 1 },
      { slug: "hurricane-enlil-is-7-55t", quantity: 1 },
    ]);
    expect(duo.tags).toContain("offerta");
  });

  it("stays out of the product database catalogue and its seeded bundle points at a real product", () => {
    expect(PRODUCTS.some((product) => product.slug === duo.slug)).toBe(false);
    expect(PRODUCTS.some((product) => product.slug === BUNDLE.heroSlug)).toBe(true);
    expect(BUNDLE.includes).toEqual(["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t"]);
  });

  it("ships its packshot, cut-out and each pack's box on disk", () => {
    for (const image of productImages["duo-horus-enlil"]) {
      expect(existsSync(join(process.cwd(), "public", cutoutSrc(image.src)!))).toBe(true);
    }
    for (const component of duo.bundleOf!) {
      const box = packBoxes[component.slug];
      expect(box, component.slug).toBeDefined();
      expect(existsSync(join(process.cwd(), "public", box!.src))).toBe(true);
    }
  });
});

describe("bundle stock", () => {
  it("is the number of complete sets the packs can still make up", () => {
    const [resolved] = withBundles(withStock({ "shatter-horus-9-65gb": 3, "hurricane-enlil-is-7-55t": 10 }), BUNDLES);
    expect(resolved).toMatchObject({ slug: "duo-horus-enlil", stock: "disponibile", availableQuantity: 3 });
    expect(availabilityLine(resolved!)).toBe("Solo 3 duo");
  });

  it("sells out with its first sold-out pack", () => {
    const [resolved] = withBundles(withStock({ "shatter-horus-9-65gb": 0 }), BUNDLES);
    expect(resolved).toMatchObject({ stock: "esaurito", availableQuantity: 0 });
  });

  it("sells out when a pack is missing from the catalogue", () => {
    const resolved = resolveBundle(duo, new Map([[horus.slug as string, horus]]));
    expect(resolved.stock).toBe("esaurito");
  });

  it("lists bundles first and keeps every product", () => {
    expect(STOREFRONT_CATALOGUE[0]?.slug).toBe("duo-horus-enlil");
    expect(STOREFRONT_CATALOGUE).toHaveLength(PRODUCTS.length + BUNDLES.length);
  });

  it("maps a line to the pieces it takes", () => {
    expect(piecesOf(duo, 2)).toEqual([
      { slug: "shatter-horus-9-65gb", quantity: 2 },
      { slug: "hurricane-enlil-is-7-55t", quantity: 2 },
    ]);
    expect(piecesOf(horus, 3)).toEqual([{ slug: "shatter-horus-9-65gb", quantity: 3 }]);
    expect(bundlesContaining("hurricane-enlil-is-7-55t", BUNDLES).map((bundle) => bundle.slug)).toEqual(["duo-horus-enlil"]);
    expect(bundlesContaining("glory-valkerion-lf", BUNDLES)).toHaveLength(0);
  });
});

describe("pricing a cart with the duo", () => {
  const provider = createMockProvider(withBundles(withStock({ "shatter-horus-9-65gb": 4, "hurricane-enlil-is-7-55t": 10 }), BUNDLES));

  it("prices the duo as one €33 line with shipping on top", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "duo-horus-enlil", quantity: 1 }] });
    expect(quote.lines[0]).toMatchObject({ slug: "duo-horus-enlil", unitPrice: { amount: 3300 }, availableQuantity: 4, issue: null });
    expect(quote.totals.subtotal.amount).toBe(3300);
    expect(quote.totals.shipping.amount).toBe(490);
  });

  it("refuses more duos than the scarcest pack allows", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: "duo-horus-enlil", quantity: 5 }] });
    expect(quote.lines[0]?.issue).toBe("Disponibilità insufficiente: ne restano 4.");
  });

  it("counts a single pack and the duo against the same stock", async () => {
    const quote = await provider.quoteCart({
      lines: [
        { slug: "duo-horus-enlil", quantity: 2 },
        { slug: "shatter-horus-9-65gb", quantity: 3 },
      ],
    });
    expect(quote.lines.every((line) => line.issue?.includes("Shatter Horus 9-65GB"))).toBe(true);

    const fits = await provider.quoteCart({
      lines: [
        { slug: "duo-horus-enlil", quantity: 2 },
        { slug: "shatter-horus-9-65gb", quantity: 2 },
      ],
    });
    expect(fits.lines.every((line) => line.issue === null)).toBe(true);
  });

  it("matches the duo's own Stripe price, not its packs'", () => {
    const quoteLine = { slug: "duo-horus-enlil", unitPrice: { amount: 3300, currency: "EUR" } };
    const matched = matchStripePrices({ lines: [quoteLine] } as never, [
      { id: "price_duo", lookup_key: "gd_duo_horus_enlil", unit_amount: 3300, currency: "eur", active: true },
    ]);
    expect(matched?.get("duo-horus-enlil")).toBe("price_duo");
  });
});

describe("the duo on Stripe", () => {
  it("is synced as its own €33 product that names what it ships", () => {
    expect(STRIPE_CATALOGUE.map((item) => item.slug)).toContain("duo-horus-enlil");
    const payload = buildStripeProduct(duo);
    expect(payload.id).toBe("gd_duo_horus_enlil");
    expect(payload.images[0]).toBe("https://geardropshop.it/products/duo-horus-enlil.webp");
    expect(payload.metadata["bundle_of"]).toBe("shatter-horus-9-65gb x1, hurricane-enlil-is-7-55t x1");
    expect(buildStripePrice(duo)).toEqual({ unitAmount: 3300, currency: "eur", lookupKey: "gd_duo_horus_enlil" });
  });

  it("comes back from a paid session with the packs whose stock it takes", () => {
    expect(slugFromStripeId("gd_duo_horus_enlil")).toBe("duo-horus-enlil");
    const checkout = paidCheckoutFromStripe(
      {
        id: "cs_live_duoDuoDuoDuo01",
        created: 1_790_000_000,
        payment_status: "paid",
        client_reference_id: "GD-DUO00001",
        customer_email: "duo@example.com",
        amount_total: 4190,
        total_details: { amount_shipping: 490 },
        payment_intent: { id: "pi_duo", shipping: { name: "Duo", address: { line1: "Via 1", postal_code: "00100", city: "Roma", state: "RM", country: "IT" } } },
      },
      [{ description: "Duo Shatter Horus + Hurricane Enlil", quantity: 1, price: { lookup_key: "gd_duo_horus_enlil", unit_amount: 3300 } }],
    );
    expect(checkout?.lines[0]).toEqual({
      slug: "duo-horus-enlil",
      name: "Duo Shatter Horus + Hurricane Enlil",
      quantity: 1,
      unitPriceCents: 3300,
      components: [
        { slug: "shatter-horus-9-65gb", quantity: 1 },
        { slug: "hurricane-enlil-is-7-55t", quantity: 1 },
      ],
    });
    expect(stripeOrderLines(checkout!)).toEqual([
      {
        slug: "duo-horus-enlil",
        name: "Duo Shatter Horus + Hurricane Enlil",
        quantity: 1,
        unit_price_cents: 3300,
        components: [
          { slug: "shatter-horus-9-65gb", quantity: 1 },
          { slug: "hurricane-enlil-is-7-55t", quantity: 1 },
        ],
      },
    ]);
  });
});

describe("bundle order migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260917100000_record_stripe_bundle_orders.sql"), "utf8");

  it("keeps the webhook-only grant and the idempotent, zero-floor stock handling", () => {
    expect(migration).toMatch(/revoke all on function public\.record_stripe_checkout_order\([^)]*\)\s+from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.record_stripe_checkout_order\([^)]*\)\s+to service_role;/);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("greatest(on_hand - part.pieces, 0)");
    expect(migration).toContain("item.value -> 'components' as components");
  });
});

describe("duo orders for the owner and the cart", () => {
  it("tells the owner to pack both starters", async () => {
    const { ownerOrderEmail } = await import("@/lib/orders/order-email");
    const checkout = paidCheckoutFromStripe(
      {
        id: "cs_live_duoDuoDuoDuo02",
        created: 1_790_000_000,
        payment_status: "paid",
        customer_email: "duo@example.com",
        amount_total: 7890,
        total_details: { amount_shipping: 490 },
        payment_intent: { id: "pi_duo2", shipping: { name: "Duo", address: { line1: "Via 1", postal_code: "00100", city: "Roma", state: "RM", country: "IT" } } },
      },
      [{ description: "Duo Shatter Horus + Hurricane Enlil", quantity: 2, price: { lookup_key: "gd_duo_horus_enlil", unit_amount: 3300 } }],
    )!;
    const email = ownerOrderEmail(checkout, { id: 7, orderNumber: "GD-DUO" });
    for (const body of [email.html, email.text]) {
      expect(body).toContain("Da spedire: 2 × Shatter Horus 9-65GB + 2 × Hurricane Enlil IS 7-55T");
    }
  });
});
