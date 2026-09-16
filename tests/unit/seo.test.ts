import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { breadcrumbJsonLd, jsonLd, productDescription, productJsonLd, productTitle, siteJsonLd } from "@/lib/seo";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it("lists the home, the shop, every category and every product on the production domain", () => {
    expect(urls).toContain("https://geardropshop.it/");
    expect(urls).toContain("https://geardropshop.it/negozio");
    for (const category of CATEGORIES) expect(urls).toContain(`https://geardropshop.it/negozio/${category.slug}`);
    for (const product of PRODUCTS) expect(urls).toContain(`https://geardropshop.it/prodotto/${product.slug}`);
    expect(urls.every((url) => url.startsWith("https://geardropshop.it/"))).toBe(true);
  });

  it("includes product images and leaves private pages out", () => {
    const glory = entries.find((entry) => entry.url.endsWith("/prodotto/glory-valkerion-lf"));
    expect(glory?.images).toEqual(["https://geardropshop.it/products/glory-valkerion-lf.webp"]);
    expect(urls.some((url) => /\/(checkout|carrello|account|admin|login|preferiti|ricerca)/.test(url))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("robots.txt", () => {
  it("lets production be crawled, keeps private areas out and points at the sitemap", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/admin", "/api/", "/checkout", "/carrello", "/account"]));
    expect(result.sitemap).toBe("https://geardropshop.it/sitemap.xml");
  });

  it("blocks preview deployments entirely", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.disallow).toBe("/");
    expect(result.sitemap).toBeUndefined();
  });
});

describe("search metadata", () => {
  const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

  it("titles products with the line name people search for", () => {
    expect(productTitle(glory)).toBe("Beyblade X Glory Valkerion LF");
    expect(productTitle({ name: "Beyblade X Stadium" })).toBe("Beyblade X Stadium");
  });

  it("writes descriptions with price and availability that fit Google's snippet", () => {
    for (const product of PRODUCTS) {
      const description = productDescription(product);
      expect(description.length).toBeLessThanOrEqual(160);
      expect(description).toContain("€");
    }
    expect(productDescription(glory)).toContain("€30,00, disponibile");
  });
});

describe("structured data", () => {
  const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

  it("describes the offer as Google's merchant listings expect", () => {
    const data = productJsonLd(glory);
    expect(data).toMatchObject({
      "@type": "Product",
      url: "https://geardropshop.it/prodotto/glory-valkerion-lf",
      image: ["https://geardropshop.it/products/glory-valkerion-lf.webp"],
      brand: { name: "Beyblade X" },
      offers: {
        price: "30.00",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: { shippingRate: { value: "4.90", currency: "EUR" }, shippingDestination: { addressCountry: "IT" } },
        hasMerchantReturnPolicy: { merchantReturnDays: 30, returnFees: "https://schema.org/FreeReturn" },
      },
    });
    expect(data).not.toHaveProperty("aggregateRating");
  });

  it("marks sold-out stock and free shipping from the threshold", () => {
    expect(productJsonLd({ ...glory, stock: "esaurito" }).offers.availability).toBe("https://schema.org/OutOfStock");
    expect(productJsonLd({ ...glory, price: { amount: 5900, currency: "EUR" } }).offers.shippingDetails.shippingRate.value).toBe("0.00");
  });

  it("publishes the shop, its search and breadcrumbs", () => {
    const site = siteJsonLd();
    expect(site["@graph"].map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(site)).toContain("infogeardrop@gmail.com");
    const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Negozio", path: "/negozio" }]);
    expect(crumbs.itemListElement[1]).toEqual({ "@type": "ListItem", position: 2, name: "Negozio", item: "https://geardropshop.it/negozio" });
  });

  it("can never close its script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
