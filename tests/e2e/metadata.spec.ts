import { expect, test } from "@playwright/test";

const productionOrigin = "https://geardropshop.it";

test.describe("public canonical metadata", () => {
  const publicRoutes = [
    { route: "/", canonical: productionOrigin },
    { route: "/negozio", canonical: `${productionOrigin}/negozio` },
    { route: "/negozio?sort=novita&page=2", canonical: `${productionOrigin}/negozio` },
    { route: "/negozio/beyblade-x", canonical: `${productionOrigin}/negozio/beyblade-x` },
    {
      route: "/negozio/beyblade-x?sort=prezzo-crescente&stock=disponibile",
      canonical: `${productionOrigin}/negozio/beyblade-x`,
    },
    {
      route: "/prodotto/cobalt-dragoon-2-60c",
      canonical: `${productionOrigin}/prodotto/cobalt-dragoon-2-60c`,
    },
    { route: "/chi-siamo", canonical: `${productionOrigin}/chi-siamo` },
    { route: "/assistenza/faq", canonical: `${productionOrigin}/assistenza/faq` },
  ] as const;

  for (const { route, canonical } of publicRoutes) {
    test(`${route} publishes its clean self-canonical`, async ({ page }) => {
      await page.goto(route);

      const links = page.locator('link[rel="canonical"]');
      await expect(links).toHaveCount(1);
      await expect(links).toHaveAttribute("href", canonical);
    });
  }

  for (const route of ["/login?next=%2Faccount", "/ricerca?q=email%40example.com"] as const) {
    test(`${route} does not inherit a misleading homepage canonical`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    });
  }
});
