import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  DIRECT,
  deriveVisitSource,
  nextVisitSource,
  parseVisitSource,
  readVisitSource,
  recordVisitSource,
  visitSourceLabel,
} from "@/lib/attribution";
import { expressCheckoutSchema, placeOrderSchema, type PlaceOrderInput } from "@/lib/checkout-schema";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuoteRequest } from "@/lib/commerce/types";
import { attributionFrom } from "@/lib/orders/stripe-order";
import { buildCheckoutSessionFields, openQuoteForStripe } from "@/lib/payments/stripe-checkout";

const visit = (search: string, referrer = "", pathname = "/prodotto/soar-phoenix-9-60gf") =>
  deriveVisitSource({ search, referrer, host: "geardropshop.it", pathname });

describe("the channel of a visit", () => {
  it("reads a Google Ads click from its click id, and never keeps the id itself", () => {
    const fromAd = visit("?gclid=Cj0KCQjw_secret&srsltid=AfmBOo");
    expect(fromAd).toEqual({ source: "google", medium: "cpc", landing: "/prodotto/soar-phoenix-9-60gf" });
    expect(JSON.stringify(fromAd)).not.toContain("Cj0KCQ");
    expect(visit("?gbraid=0AAAAA").medium).toBe("cpc");
    expect(visit("?wbraid=CkA").medium).toBe("cpc");
  });

  it("tells a free Merchant Center listing apart from a paid click", () => {
    expect(visit("?srsltid=AfmBOoq")).toMatchObject({ source: "google", medium: "free" });
  });

  it("lets utm tags win, cleaned to plain labels", () => {
    expect(visit("?utm_source=Instagram&utm_medium=Bio&utm_campaign=Meta%20Ottobre&gclid=x")).toEqual({
      source: "instagram",
      medium: "bio",
      campaign: "meta ottobre",
      landing: "/prodotto/soar-phoenix-9-60gf",
    });
    // A tag carrying anything but a plain label is ignored rather than stored.
    expect(visit("?utm_source=%3Cscript%3E&gclid=x")).toMatchObject({ source: "google", medium: "cpc" });
    expect(visit("?utm_source=youtube")).toMatchObject({ source: "youtube", medium: "none" });
  });

  it("reads organic search, social networks and referrals from the referrer", () => {
    expect(visit("", "https://www.google.it/")).toMatchObject({ source: "google", medium: "organic" });
    expect(visit("", "https://www.bing.com/search?q=beyblade")).toMatchObject({ source: "bing", medium: "organic" });
    expect(visit("", "https://l.instagram.com/")).toMatchObject({ source: "instagram", medium: "social" });
    expect(visit("", "https://m.youtube.com/")).toMatchObject({ source: "youtube", medium: "social" });
    expect(visit("", "https://www.vinted.it/member/1")).toMatchObject({ source: "vinted.it", medium: "referral" });
  });

  it("does not count our own pages or the Stripe checkout as a new visit", () => {
    expect(visit("", "https://geardropshop.it/negozio")).toEqual({ ...DIRECT, landing: "/prodotto/soar-phoenix-9-60gf" });
    expect(visit("", "https://www.geardropshop.it/")).toMatchObject(DIRECT);
    expect(visit("", "https://checkout.stripe.com/c/pay/cs_live_x")).toMatchObject(DIRECT);
  });

  it("recognises the Instagram in-app browser, which drops the referrer but appends fbclid", () => {
    expect(visit("?fbclid=IwAR0abc")).toMatchObject({ source: "instagram-facebook", medium: "social" });
  });

  it("keeps the landing path without its query string", () => {
    expect(visit("", "", "/negozio/hasbro").landing).toBe("/negozio/hasbro");
    expect(visit("", "", "/checkout/successo").landing).toBe("/checkout/successo");
  });
});

describe("which channel a visit keeps", () => {
  const ad = { source: "google", medium: "cpc" };
  it("lets a later real channel replace the first, and never a direct reload", () => {
    expect(nextVisitSource(null, DIRECT)).toEqual(DIRECT);
    expect(nextVisitSource(DIRECT, ad)).toEqual(ad);
    expect(nextVisitSource(ad, DIRECT)).toEqual(ad);
    expect(nextVisitSource(ad, { source: "instagram", medium: "social" })).toEqual({ source: "instagram", medium: "social" });
  });
});

describe("the browser side", () => {
  function memoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }
  function fakeWindow(search: string, referrer: string, storage: Storage | null = memoryStorage()) {
    return {
      location: { search, hostname: "geardropshop.it", pathname: "/" },
      document: { referrer },
      get sessionStorage(): Storage {
        if (!storage) throw new DOMException("denied", "SecurityError");
        return storage;
      },
    } as unknown as Window;
  }

  it("notes the channel on landing and keeps it through a direct reload", () => {
    const storage = memoryStorage();
    recordVisitSource(fakeWindow("?gclid=abc", "https://www.google.com/", storage));
    recordVisitSource(fakeWindow("", "", storage));
    expect(readVisitSource(fakeWindow("", "", storage))).toEqual({ source: "google", medium: "cpc", landing: "/" });
    expect(storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toContain("abc");
  });

  it("gives up quietly when the browser refuses storage", () => {
    const blocked = fakeWindow("?gclid=abc", "", null);
    expect(recordVisitSource(blocked)).toBeNull();
    expect(readVisitSource(blocked)).toBeNull();
  });

  it("ignores a tampered entry", () => {
    const storage = memoryStorage();
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify({ source: "<b>x</b>", medium: "cpc" }));
    expect(readVisitSource(fakeWindow("", "", storage))).toBeNull();
    storage.setItem(ATTRIBUTION_STORAGE_KEY, "not json");
    expect(readVisitSource(fakeWindow("", "", storage))).toBeNull();
  });
});

describe("the checkout carries the channel to the order", () => {
  const base = {
    contact: {
      firstName: "Mario",
      lastName: "Rossi",
      email: "mario@example.com",
      phone: "3331234567",
      address: "Via Roma 1",
      city: "Milano",
      postalCode: "20121",
      province: "MI",
      shippingMethod: "standard",
    },
    lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
    idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
  } as PlaceOrderInput;

  it("drops a malformed channel instead of refusing the order", () => {
    const parsed = placeOrderSchema.safeParse({ ...base, attribution: { source: "DROP TABLE;", medium: 7 } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.attribution).toBeUndefined();
    const express = expressCheckoutSchema.safeParse({
      lines: base.lines,
      idempotencyKey: base.idempotencyKey,
      attribution: { source: "google", medium: "cpc" },
    });
    expect(express.success && express.data.attribution).toEqual({ source: "google", medium: "cpc" });
  });

  it("writes it into the Stripe session metadata, and nothing when there is none", async () => {
    const quote = openQuoteForStripe(
      await createMockProvider().quoteCart({ lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }], shippingCode: "standard" } as CartQuoteRequest),
    );
    const prices = new Map([["cobalt-dragoon-2-60c", "price_cobalt"]]);
    const order = placeOrderSchema.parse({
      ...base,
      attribution: { source: "google", medium: "cpc", landing: "/prodotto/cobalt-dragoon-2-60c" },
    });
    const fields = buildCheckoutSessionFields({ quote, order, origin: "https://geardropshop.it" }, prices);
    expect(fields).toMatchObject({
      "metadata[source]": "google",
      "metadata[medium]": "cpc",
      "metadata[landing]": "/prodotto/cobalt-dragoon-2-60c",
    });
    expect(fields).not.toHaveProperty("metadata[campaign]");

    const none = buildCheckoutSessionFields({ quote, order: base, origin: "https://geardropshop.it" }, prices);
    expect(Object.keys(none).filter((key) => /metadata\[(source|medium|campaign|landing)\]/.test(key))).toEqual([]);
  });

  it("reads it back from the paid session, validated again", () => {
    expect(attributionFrom({ source: "google", medium: "cpc", campaign: "shopping test" })).toEqual({
      source: "google",
      medium: "cpc",
      campaign: "shopping test",
    });
    expect(attributionFrom({ order_ref: "GD-1" })).toBeNull();
    expect(attributionFrom({ source: "<x>", medium: "cpc" })).toBeNull();
    expect(attributionFrom(null)).toBeNull();
  });
});

describe("how the admin reads it", () => {
  it("names the channels that matter, and says when an order has none", () => {
    expect(visitSourceLabel({ source: "google", medium: "cpc" })).toBe("Google Ads");
    expect(visitSourceLabel({ source: "google", medium: "free" })).toBe("Google gratuito (Shopping o ricerca)");
    expect(visitSourceLabel({ source: "instagram", medium: "bio", campaign: "meta ottobre" })).toBe("instagram / bio · meta ottobre");
    expect(visitSourceLabel(null)).toBe("Non registrata");
    expect(parseVisitSource(undefined)).toBeNull();
  });
});
