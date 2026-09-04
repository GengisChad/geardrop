import { expect, test, type Page } from "@playwright/test";

/** A PDP also renders "Si abbina bene con" cards, which carry the same testids. */
const buyPanel = (page: Page) => page.locator("#buy-panel");


test.describe("home", () => {
  test("renders the hero, the brand lockup and one unique product shelf", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pronti alla battaglia");
    await expect(page.getByRole("link", { name: "GEAR//DROP — vai alla home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    await expect(page.getByTestId("product-carousel")).toHaveCount(1);
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });

  test("uses the supplied logo asset rather than redrawn type", async ({ page }) => {
    await page.goto("/");
    // The wordmark must stay an image: audit §7.1 forbids rebuilding it with a font.
    const logo = page.getByRole("link", { name: "GEAR//DROP — vai alla home" }).locator("img");
    await expect(logo).toHaveAttribute("src", /lockup/);
  });

  test("navigates from a card to the product page", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("product-card").first();
    const slug = await card.getAttribute("data-slug");
    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/prodotto/${slug}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("catalogue", () => {
  test("lists products and reports a count", async ({ page }) => {
    await page.goto("/negozio");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const count = Number(await page.getByTestId("result-count").innerText());
    expect(count).toBeGreaterThan(0);
    await expect(page.getByTestId("product-card")).toHaveCount(count);
  });

  test("sorting by price ascending actually reorders the grid", async ({ page }) => {
    await page.goto("/negozio?sort=prezzo-asc");
    const prices = await page.getByTestId("product-card").locator("p.tabular").allInnerTexts();
    const numbers = prices.map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", ".")));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  test("a filter narrows results and survives a reload", async ({ page, isMobile }) => {
    await page.goto("/negozio");
    const before = Number(await page.getByTestId("result-count").innerText());

    // Desktop keeps the sidebar on screen; mobile puts the same controls in a sheet.
    // Both are mounted, so the panel has to be picked explicitly.
    const openFilters = async () => {
      if (isMobile) await page.getByTestId("filters-open").click();
      return isMobile ? page.getByTestId("filters-sheet") : page.locator("aside");
    };

    const panel = await openFilters();
    // No reviewed preorder is sold out; that zero-count facet is intentionally disabled.
    // Four attack blades and two arena sets provide a real, nonempty filter subset.
    await expect(panel.getByTestId("filter-stock-esaurito")).toBeDisabled();
    await panel.getByTestId("filter-type-attacco").check();
    if (isMobile) await page.getByTestId("filters-apply").click();

    await expect(page.getByTestId("result-count")).not.toHaveText(String(before));
    await expect(page).toHaveURL(/type=attacco/);
    await expect(page.getByTestId("product-card")).toHaveCount(4);

    // Filter state lives in the URL, so it must survive a reload.
    await page.reload();
    const reopened = await openFilters();
    await expect(reopened.getByTestId("filter-type-attacco")).toBeChecked();
  });

  test("category pages only show their own products", async ({ page }) => {
    await page.goto("/negozio/stadi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stadi");
    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toBeVisible();
    for (const slug of await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-slug")))) {
      expect(["drop-attack-battle-set", "sneak-attack-battle-set"]).toContain(slug);
    }
  });

  test("an empty category shows the designed empty state, not a blank grid", async ({ page }) => {
    // Lanciatori and Accessori have no SKUs: see docs/reference-audit.md §9.2.
    await page.goto("/negozio/lanciatori");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("result-count")).toHaveText("0");
  });

  test("a hand-mangled query string degrades to the default listing", async ({ page }) => {
    const response = await page.goto("/negozio?sort=casuale&page=-5&stock=inventato");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });
});

test.describe("product page", () => {
  test("shows price, availability and gallery", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cobalt Dragoon 2-60C");
    await expect(page.getByTestId("pdp-price")).toHaveText("€25,50");
    await expect(buyPanel(page).getByTestId("add-to-cart")).toBeVisible();
  });

  test("a removed catalogue product cannot still be purchased", async ({ page }) => {
    // All current products are preorders. The sold-out CTA is covered with an explicit
    // product fixture in preorder-storefront.test.tsx; archived routes must be real 404s.
    const response = await page.goto("/prodotto/phoenix-wing-9-60gf");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);
  });

  test("a pre-order product offers pre-order", async ({ page }) => {
    await page.goto("/prodotto/sneak-attack-battle-set");
    await expect(buyPanel(page).getByTestId("add-to-cart")).toContainText("Pre-ordina");
  });

  test("publishes Product structured data matching the visible price", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const raw = await page.locator('script[type="application/ld+json"]').innerText();
    const data = JSON.parse(raw);
    expect(data["@type"]).toBe("Product");
    expect(data.offers.price).toBe("25.50");
    expect(data.offers.availability).toBe("https://schema.org/PreOrder");
  });

  test("an unknown product 404s", async ({ page }) => {
    // Status, not just content: a streaming boundary above this route would flush 200
    // before notFound() runs, turning this into a soft 404 for crawlers.
    const response = await page.goto("/prodotto/non-esiste");
    expect(response?.status()).toBe(404);
  });

  test("an unknown category 404s", async ({ page }) => {
    const response = await page.goto("/negozio/non-esiste");
    expect(response?.status()).toBe(404);
  });
});

test.describe("search", () => {
  test("finds a product by name", async ({ page }) => {
    await page.goto("/ricerca?q=cobalt");
    await expect(page.getByTestId("search-results")).toBeVisible();
    await expect(page.getByTestId("product-card").first()).toContainText("Cobalt Dragoon");
  });

  test("shows an empty state for no matches", async ({ page }) => {
    await page.goto("/ricerca?q=zzzzzz");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});

test("404 page renders for an unknown route", async ({ page }) => {
  const response = await page.goto("/questa-pagina-non-esiste");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Fuori dallo stadio.")).toBeVisible();
});
