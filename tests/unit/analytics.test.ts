import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "@/lib/analytics";

type Pageview = {
  type: "pageview";
  url: string;
};

const pageview = (url: string): Pageview => ({ type: "pageview", url });

describe("storefront analytics sanitizer", () => {
  it.each([
    "/account",
    "/account/orders",
    "/admin",
    "/admin/orders/123",
    "/auth",
    "/auth/callback",
    "/carrello",
    "/checkout",
    "/checkout/conferma",
    "/login",
    "/registrati",
    "/password-dimenticata",
    "/nuova-password",
    "/conferma-email",
    "/conferma-recupero",
    "/preferiti",
  ])("drops pageviews for the sensitive route family %s", (pathname) => {
    expect(sanitizeAnalyticsEvent(pageview(`https://geardropshop.it${pathname}?token=secret#step`))).toBeNull();
  });

  it.each([
    "/accounting",
    "/administrator",
    "/authentication",
    "/carrellone",
    "/checkout-guide",
    "/logins",
    "/registrati-al-torneo",
    "/preferiti-dalla-community",
  ])("keeps similarly prefixed public paths outside exact sensitive boundaries: %s", (pathname) => {
    expect(sanitizeAnalyticsEvent(pageview(`https://geardropshop.it${pathname}?ref=private#details`))).toEqual(
      pageview(`https://geardropshop.it${pathname}`),
    );
  });

  it("strips every query string and fragment from an allowed pageview", () => {
    expect(
      sanitizeAnalyticsEvent(
        pageview("https://geardropshop.it/negozio/beyblade-x?sort=novita&q=email%40example.com#filters"),
      ),
    ).toEqual(pageview("https://geardropshop.it/negozio/beyblade-x"));
  });

  it.each(["", "not a url", "://missing-scheme", "javascript:alert(1)", "https://%"])(
    "fails closed for a malformed or unsupported URL: %s",
    (url) => {
      expect(sanitizeAnalyticsEvent(pageview(url))).toBeNull();
    },
  );

  it("drops custom events so this release remains pageview-only", () => {
    expect(sanitizeAnalyticsEvent({ type: "event", url: "https://geardropshop.it/negozio" })).toBeNull();
  });
});
