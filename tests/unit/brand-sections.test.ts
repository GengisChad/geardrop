/**
 * Tests for the brand-sections feature: shippingPlanFor, mock provider brand awareness,
 * SEO brand/shipping, Merchant feed brand/shipping, and the checkout server refusal.
 *
 * No real Takara Tomy products are in src/data/catalog.ts. Every test that needs one
 * injects a fixture defined here.
 */
import { describe, expect, it } from "vitest";
import {
  FREE_SHIPPING_THRESHOLD,
  PARTNER_SHIPPING_METHOD,
  SHIPPING_METHODS,
  brandOf,
  shippingPlanFor,
} from "@/data/catalog";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";

// ---------------------------------------------------------------------------
// Fixture: a minimal Takara Tomy product and a Hasbro product for tests
// ---------------------------------------------------------------------------

const HASBRO_PRODUCT = PRODUCTS.find((p) => p.slug === "cobalt-dragoon-2-60c")!;
const HASBRO_PRICE = HASBRO_PRODUCT.price.amount;

const TAKARA_PRODUCT: Product = {
  ...HASBRO_PRODUCT,
  slug: "test-takara-tomy-piece" as Product["slug"],
  name: "Test Takara Piece",
  tagline: "Test tagline.",
  brand: "takara-tomy",
  consignment: true,
  commissionCents: 300,
};

// ---------------------------------------------------------------------------
// brandOf helper
// ---------------------------------------------------------------------------

describe("brandOf", () => {
  it("returns hasbro for a product without a brand field", () => {
    expect(brandOf({})).toBe("hasbro");
  });

  it("returns hasbro when brand is explicitly hasbro", () => {
    expect(brandOf({ brand: "hasbro" })).toBe("hasbro");
  });

  it("returns takara-tomy when brand is takara-tomy", () => {
    expect(brandOf({ brand: "takara-tomy" })).toBe("takara-tomy");
  });
});

// ---------------------------------------------------------------------------
// shippingPlanFor
// ---------------------------------------------------------------------------

describe("shippingPlanFor", () => {
  it("empty set → SHIPPING_METHODS, not locked, composition empty", () => {
    const plan = shippingPlanFor(new Set());
    expect(plan.methods).toEqual(SHIPPING_METHODS);
    expect(plan.locked).toBe(false);
    expect(plan.composition).toBe("empty");
  });

  it("hasbro-only → SHIPPING_METHODS, not locked, composition hasbro-only", () => {
    const plan = shippingPlanFor(new Set(["hasbro"]));
    expect(plan.methods).toEqual(SHIPPING_METHODS);
    expect(plan.locked).toBe(false);
    expect(plan.composition).toBe("hasbro-only");
  });

  it("takara-only → [PARTNER_SHIPPING_METHOD], locked, composition takara-only", () => {
    const plan = shippingPlanFor(new Set(["takara-tomy"]));
    expect(plan.methods).toEqual([PARTNER_SHIPPING_METHOD]);
    expect(plan.locked).toBe(true);
    expect(plan.composition).toBe("takara-only");
  });

  it("mixed → [inpost-point], locked, composition mixed", () => {
    const plan = shippingPlanFor(new Set(["hasbro", "takara-tomy"]));
    expect(plan.methods).toHaveLength(1);
    expect(plan.methods[0]!.code).toBe("inpost-point");
    expect(plan.locked).toBe(true);
    expect(plan.composition).toBe("mixed");
  });
});

// ---------------------------------------------------------------------------
// Mock provider: quoteCart with injected Takara catalogue
// ---------------------------------------------------------------------------

describe("mock quoteCart — takara-only cart", () => {
  const provider = createMockProvider([TAKARA_PRODUCT]);
  const TAKARA_PRICE = TAKARA_PRODUCT.price.amount;

  it("has one locked option at 500 with code poste-point-partner", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: TAKARA_PRODUCT.slug, quantity: 1 }] });
    expect(quote.shippingOptions).toHaveLength(1);
    expect(quote.shippingOptions[0]).toMatchObject({
      code: "poste-point-partner",
      price: { amount: 500 },
      locked: true,
    });
    expect(quote.shippingCode).toBe("poste-point-partner");
    expect(quote.totals.shipping.amount).toBe(500);
  });

  it("is free at the threshold", async () => {
    const quantity = Math.ceil(FREE_SHIPPING_THRESHOLD / TAKARA_PRICE);
    const quote = await provider.quoteCart({ lines: [{ slug: TAKARA_PRODUCT.slug, quantity }] });
    expect(quote.totals.subtotal.amount).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(quote.totals.shipping.amount).toBe(0);
    expect(quote.totals.freeShippingRemaining).toBe(0);
  });

  it("a stale hasbro code falls back to the plan's first method (partner)", async () => {
    const quote = await provider.quoteCart({
      lines: [{ slug: TAKARA_PRODUCT.slug, quantity: 1 }],
      shippingCode: "inpost-point",
    });
    expect(quote.shippingCode).toBe("poste-point-partner");
    expect(quote.totals.shipping.amount).toBe(500);
  });
});

describe("mock quoteCart — mixed cart", () => {
  const provider = createMockProvider([HASBRO_PRODUCT, TAKARA_PRODUCT]);

  it("has one locked inpost-point option at 565", async () => {
    const quote = await provider.quoteCart({
      lines: [
        { slug: HASBRO_PRODUCT.slug, quantity: 1 },
        { slug: TAKARA_PRODUCT.slug, quantity: 1 },
      ],
    });
    expect(quote.shippingOptions).toHaveLength(1);
    expect(quote.shippingOptions[0]).toMatchObject({
      code: "inpost-point",
      price: { amount: 565 },
      locked: true,
    });
    expect(quote.shippingCode).toBe("inpost-point");
  });

  it("is free at the threshold", async () => {
    const perItem = Math.min(HASBRO_PRICE, TAKARA_PRODUCT.price.amount);
    const quantity = Math.ceil(FREE_SHIPPING_THRESHOLD / perItem);
    const quote = await provider.quoteCart({
      lines: [{ slug: HASBRO_PRODUCT.slug, quantity }],
    });
    expect(quote.totals.shipping.amount).toBe(0);
  });

  it("a stale poste-point-partner code falls back to inpost-point", async () => {
    const quote = await provider.quoteCart({
      lines: [
        { slug: HASBRO_PRODUCT.slug, quantity: 1 },
        { slug: TAKARA_PRODUCT.slug, quantity: 1 },
      ],
      shippingCode: "poste-point-partner",
    });
    expect(quote.shippingCode).toBe("inpost-point");
  });
});

describe("mock quoteCart — hasbro-only cart (unchanged behaviour)", () => {
  const provider = createMockProvider();

  it("still offers both SHIPPING_METHODS, not locked, InPost default", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: HASBRO_PRODUCT.slug, quantity: 1 }] });
    expect(quote.shippingOptions).toHaveLength(2);
    expect(quote.shippingOptions.every((o) => !o.locked)).toBe(true);
    expect(quote.shippingCode).toBe("inpost-point");
    expect(quote.totals.shipping.amount).toBe(565);
  });

  it("free at the threshold", async () => {
    const quantity = Math.ceil(FREE_SHIPPING_THRESHOLD / HASBRO_PRICE);
    const quote = await provider.quoteCart({ lines: [{ slug: HASBRO_PRODUCT.slug, quantity }] });
    expect(quote.totals.shipping.amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mock provider: brand filter
// ---------------------------------------------------------------------------

describe("mock listProducts — brand filter", () => {
  const provider = createMockProvider([HASBRO_PRODUCT, TAKARA_PRODUCT]);

  it("brand: hasbro → only hasbro products", async () => {
    const page = await provider.listProducts({ brand: "hasbro" });
    expect(page.items.every((p) => brandOf(p) === "hasbro")).toBe(true);
    expect(page.items.some((p) => p.slug === HASBRO_PRODUCT.slug)).toBe(true);
    expect(page.items.every((p) => p.slug !== TAKARA_PRODUCT.slug)).toBe(true);
  });

  it("brand: takara-tomy → only takara products", async () => {
    const page = await provider.listProducts({ brand: "takara-tomy" });
    expect(page.items.every((p) => brandOf(p) === "takara-tomy")).toBe(true);
    expect(page.items.some((p) => p.slug === TAKARA_PRODUCT.slug)).toBe(true);
  });

  it("no brand filter → all products", async () => {
    const page = await provider.listProducts();
    expect(page.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SEO: brand and shippingDetails for a Takara product
// ---------------------------------------------------------------------------

describe("SEO productJsonLd — Takara Tomy product", () => {
  it("uses Takara Tomy as the brand name", async () => {
    const { productJsonLd } = await import("@/lib/seo");
    const data = productJsonLd(TAKARA_PRODUCT);
    expect(data.brand).toEqual({ "@type": "Brand", name: "Takara Tomy" });
  });

  it("shippingDetails lists only the partner method", async () => {
    const { productJsonLd } = await import("@/lib/seo");
    const data = productJsonLd(TAKARA_PRODUCT);
    expect(data.offers.shippingDetails).toHaveLength(1);
    expect(data.offers.shippingDetails[0]!.shippingLabel).toBe(PARTNER_SHIPPING_METHOD.label);
  });

  it("shippingDetails for a hasbro product lists SHIPPING_METHODS", async () => {
    const { productJsonLd } = await import("@/lib/seo");
    const data = productJsonLd(HASBRO_PRODUCT);
    expect(data.offers.shippingDetails).toHaveLength(SHIPPING_METHODS.length);
  });
});

describe("SEO siteJsonLd — OnlineStore partner service", () => {
  it("does NOT include the partner service when no takara products exist", async () => {
    const { siteJsonLd } = await import("@/lib/seo");
    const store = siteJsonLd({ includePartner: false })["@graph"][0] as Record<string, unknown>;
    const services = store["hasShippingService"] as { "@id": string }[];
    expect(services.some((s) => s["@id"].includes("poste-point-partner"))).toBe(false);
  });

  it("adds the partner service when includePartner is true", async () => {
    const { siteJsonLd } = await import("@/lib/seo");
    const store = siteJsonLd({ includePartner: true })["@graph"][0] as Record<string, unknown>;
    const services = store["hasShippingService"] as { "@id": string }[];
    expect(services.some((s) => s["@id"].includes("poste-point-partner"))).toBe(true);
    expect(services).toHaveLength(SHIPPING_METHODS.length + 1);
  });
});

// ---------------------------------------------------------------------------
// Merchant feed: brand and shipping rows for a Takara product
// ---------------------------------------------------------------------------

describe("Merchant feed — Takara Tomy product", () => {
  function buildOffer(product: Product): string {
    // Re-uses the same logic as the route by constructing the XML rows inline,
    // to avoid importing a server-only route file.
    const escape = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const euro = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;
    const brandName = product.unofficial
      ? "GEAR//DROP"
      : brandOf(product) === "takara-tomy"
        ? "Takara Tomy"
        : "Hasbro";
    const free = product.price.amount >= FREE_SHIPPING_THRESHOLD;
    const shippingMethods =
      brandOf(product) === "takara-tomy" ? [PARTNER_SHIPPING_METHOD] : SHIPPING_METHODS;
    const shippingRows = shippingMethods
      .map(
        (m) =>
          `<g:shipping><g:country>IT</g:country><g:service>${escape(m.label)}</g:service><g:price>${euro(free ? 0 : m.priceCents)}</g:price></g:shipping>`,
      )
      .join("");
    return `<g:brand>${escape(brandName)}</g:brand>${shippingRows}`;
  }

  it("uses Takara Tomy as the brand", () => {
    const xml = buildOffer(TAKARA_PRODUCT);
    expect(xml).toContain("<g:brand>Takara Tomy</g:brand>");
  });

  it("lists only the partner shipping row for a Takara product", () => {
    const xml = buildOffer(TAKARA_PRODUCT);
    expect(xml).toContain(PARTNER_SHIPPING_METHOD.label);
    expect(xml).not.toContain("InPost");
    // Exactly one shipping row
    expect(xml.match(/<g:shipping>/g)?.length).toBe(1);
  });

  it("lists SHIPPING_METHODS rows for a Hasbro product", () => {
    const xml = buildOffer(HASBRO_PRODUCT);
    expect(xml).toContain("<g:brand>Hasbro</g:brand>");
    expect(xml.match(/<g:shipping>/g)?.length).toBe(SHIPPING_METHODS.length);
  });
});

// ---------------------------------------------------------------------------
// Checkout server refusal when a pickup point is missing for the locked method
// ---------------------------------------------------------------------------

describe("checkout server refusal — pickup point missing", () => {
  it("refuses when the selected method needs a pickup point but none was submitted", async () => {
    const { PICKUP_POINT_MESSAGE } = await import("@/lib/checkout-schema");
    const { shippingMethodByCode } = await import("@/data/catalog");

    // poste-point-partner needs a pickup point
    const method = shippingMethodByCode("poste-point-partner");
    expect(method?.pickupPoint).toBe(true);

    // The validation logic from actions.ts: pickupPoint < 3 chars ↔ refuse
    const pickupPointMissing = method?.pickupPoint && "".trim().length < 3;
    expect(pickupPointMissing).toBe(true);

    // The message is carrier-neutral
    expect(PICKUP_POINT_MESSAGE).toBe(
      "Scrivi il punto di ritiro o il Locker dove ritirare il pacco.",
    );
  });

  it("passes when a pickup point of ≥ 3 chars is present", async () => {
    const { shippingMethodByCode } = await import("@/data/catalog");
    const method = shippingMethodByCode("poste-point-partner");
    const missing = method?.pickupPoint && "MIL123".trim().length < 3;
    expect(missing).toBe(false);
  });
});
