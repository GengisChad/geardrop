import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import {
  buildStripePrice,
  buildStripeProduct,
  formEncode,
  planProductSync,
  stripeProductId,
  type StripeProduct,
} from "../../scripts/sync-stripe-products";

const product = PRODUCTS[0]!;

function inSync(overrides: Partial<StripeProduct> = {}): StripeProduct {
  const desired = buildStripeProduct(product);
  const price = buildStripePrice(product);
  return {
    id: desired.id,
    name: desired.name,
    description: desired.description,
    images: desired.images,
    url: desired.url,
    active: true,
    metadata: desired.metadata,
    default_price: { id: "price_current", unit_amount: price.unitAmount, currency: price.currency, active: true },
    ...overrides,
  };
}

describe("stripe product sync", () => {
  it("derives a stable Stripe id from the slug", () => {
    expect(stripeProductId("cobalt-dragoon-2-60c")).toBe("gd_cobalt_dragoon_2_60c");
    expect(new Set(PRODUCTS.map((item) => stripeProductId(item.slug))).size).toBe(PRODUCTS.length);
  });

  it("publishes absolute image and product URLs on the production origin", () => {
    const payload = buildStripeProduct(product);

    expect(payload.images.length).toBeGreaterThan(0);
    for (const image of payload.images) expect(image).toMatch(/^https:\/\/geardropshop\.it\/products\//);
    expect(payload.url).toBe(`https://geardropshop.it/prodotto/${product.slug}`);
    expect(payload.metadata).toEqual({ slug: product.slug, sku: product.slug.toUpperCase(), category: product.category });
  });

  it("prices in integer cents with a lower-case currency", () => {
    expect(buildStripePrice(product)).toEqual({
      unitAmount: product.price.amount,
      currency: "eur",
      lookupKey: stripeProductId(product.slug),
    });
  });

  it("form-encodes arrays and records with Stripe's bracket syntax", () => {
    const body = formEncode({ name: "X", active: true, images: ["a", "b"], metadata: { slug: "s" }, skipped: undefined });

    expect(body.get("name")).toBe("X");
    expect(body.get("active")).toBe("true");
    expect(body.get("images[0]")).toBe("a");
    expect(body.get("images[1]")).toBe("b");
    expect(body.get("metadata[slug]")).toBe("s");
    expect(body.has("skipped")).toBe(false);
  });

  it("creates a missing product together with its first price", () => {
    expect(planProductSync(buildStripeProduct(product), buildStripePrice(product), null)).toEqual({
      product: "create",
      changedFields: [],
      price: "create",
      replacesPriceId: null,
    });
  });

  it("leaves an aligned product untouched", () => {
    expect(planProductSync(buildStripeProduct(product), buildStripePrice(product), inSync())).toEqual({
      product: "unchanged",
      changedFields: [],
      price: "unchanged",
      replacesPriceId: null,
    });
  });

  it("replaces the price when the amount changes", () => {
    const existing = inSync({ default_price: { id: "price_old", unit_amount: 1, currency: "eur", active: true } });

    expect(planProductSync(buildStripeProduct(product), buildStripePrice(product), existing)).toMatchObject({
      product: "unchanged",
      price: "replace",
      replacesPriceId: "price_old",
    });
  });

  it("replaces an archived default price even when the amount matches", () => {
    const price = buildStripePrice(product);
    const existing = inSync({
      default_price: { id: "price_archived", unit_amount: price.unitAmount, currency: price.currency, active: false },
    });

    expect(planProductSync(buildStripeProduct(product), price, existing)).toMatchObject({
      price: "replace",
      replacesPriceId: "price_archived",
    });
  });

  it("updates changed fields and reactivates an archived product", () => {
    const existing = inSync({ name: "Vecchio nome", active: false });

    expect(planProductSync(buildStripeProduct(product), buildStripePrice(product), existing)).toMatchObject({
      product: "update",
      changedFields: ["name", "active"],
    });
  });
});
