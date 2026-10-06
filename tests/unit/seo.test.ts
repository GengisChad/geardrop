import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { BUNDLES, CATEGORIES, FREE_SHIPPING_THRESHOLD, PRODUCTS } from "@/data/catalog";
import { oneCardPerFamily } from "@/lib/commerce/variants";
import { breadcrumbJsonLd, jsonLd, productDescription, productJsonLd, productTitle, siteJsonLd } from "@/lib/seo";

// The sitemap reads the published meta months from Supabase; the unit test stands in for
// it so the file's own shape is what is under test.
vi.mock("@/lib/storefront/meta-repository", () => ({
  getStorefrontMetaArchive: async () => [
    { month: "2026-10", title: "Meta ottobre 2026", publishedAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" },
  ],
}));

afterEach(() => vi.unstubAllEnvs());

describe("sitemap", () => {
  let entries: Awaited<ReturnType<typeof sitemap>>;
  let urls: string[];
  beforeAll(async () => {
    entries = await sitemap();
    urls = entries.map((entry) => entry.url);
  });

  it("lists the meta page and every published month", () => {
    expect(urls).toContain("https://geardropshop.it/meta");
    expect(urls).toContain("https://geardropshop.it/meta/2026-10");
  });

  it("lists the home, the shop, every category and every product on the production domain", () => {
    expect(urls).toContain("https://geardropshop.it/");
    expect(urls).toContain("https://geardropshop.it/negozio");
    for (const category of CATEGORIES) expect(urls).toContain(`https://geardropshop.it/negozio/${category.slug}`);
    for (const product of oneCardPerFamily([...BUNDLES, ...PRODUCTS])) expect(urls).toContain(`https://geardropshop.it/prodotto/${product.slug}`);
    // The other colours of the deck case name the first as canonical, so only it is listed.
    expect(urls).toContain("https://geardropshop.it/prodotto/porta-deck-giallo");
    expect(urls).not.toContain("https://geardropshop.it/prodotto/porta-deck-blu");
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
    // Whatever the catalogue is selling as a pre-order today, its snippet has to say so.
    const preorder = PRODUCTS.find((product) => product.stock === "pre-ordine");
    expect(preorder, "the catalogue has no pre-order to check the wording against").toBeDefined();
    expect(productDescription(preorder!)).toContain(", pre-ordine");
  });
});

describe("structured data", () => {
  const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

  it("describes the offer as Google's merchant listings expect", () => {
    // Pinned to a pre-order so the availability line is exercised whatever Glory is selling as.
    const data = productJsonLd({ ...glory, stock: "pre-ordine" });
    expect(data).toMatchObject({
      "@type": "Product",
      url: "https://geardropshop.it/prodotto/glory-valkerion-lf",
      image: ["https://geardropshop.it/products/glory-valkerion-lf.webp"],
      brand: { name: "Hasbro" },
      offers: {
        price: (glory.price.amount / 100).toFixed(2),
        priceCurrency: "EUR",
        availability: "https://schema.org/PreOrder",
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: [{ shippingRate: { value: "4.90", currency: "EUR" }, shippingDestination: { addressCountry: "IT" } }, {}, {}],
        hasMerchantReturnPolicy: { merchantReturnDays: 30, returnFees: "https://schema.org/FreeReturn" },
      },
    });
    expect(data).not.toHaveProperty("aggregateRating");
  });

  it("marks sold-out stock and free shipping from the threshold", () => {
    expect(productJsonLd({ ...glory, stock: "esaurito" }).offers.availability).toBe("https://schema.org/OutOfStock");
    // Every carrier the checkout offers is free from the threshold, and costs what it costs below it.
    expect(
      productJsonLd({ ...glory, price: { amount: FREE_SHIPPING_THRESHOLD, currency: "EUR" } }).offers.shippingDetails.map(
        (details) => details.shippingRate.value,
      ),
    ).toEqual(["0.00", "0.00", "0.00"]);
    expect(productJsonLd({ ...glory, price: { amount: 2300, currency: "EUR" } }).offers.shippingDetails.map((details) => [details.shippingLabel, details.shippingRate.value])).toEqual([
      ["Poste Italiane · consegna a casa", "4.90"],
      ["InPost · punto di ritiro o Locker", "5.65"],
      ["InPost · consegna a casa", "6.65"],
    ]);
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
