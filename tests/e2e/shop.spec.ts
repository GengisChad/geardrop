import { expect, test, type Page } from "@playwright/test";
import { PRODUCTS } from "../../src/data/catalog";

const ATTACK_PRODUCT_COUNT = PRODUCTS.filter((product) => product.bladeType === "attacco").length;

/** A PDP also renders "Si abbina bene con" cards, which carry the same testids. */
const buyPanel = (page: Page) => page.locator("#buy-panel");


test.describe("home", () => {
  test("renders the drop up front, what ships now, then the rest, with no fight animation", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Beyblade X originali");
    await expect(page.getByRole("link", { name: "GEAR//DROP — vai alla home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scegli. Carica. Lancia." })).toHaveCount(0);
    await expect(page.getByTestId("arena")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pronti da spedire" })).toBeVisible();
    // A new release on the shelf has its own row (owner, 2026-10-08); "Tutto il resto" holds only
    // what no named row took, which in the reviewed catalogue is nothing.
    await expect(page.getByRole("heading", { name: "Appena arrivati" })).toBeVisible();
    await expect(page.getByTestId("product-carousel")).toHaveCount(0);
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });

  test("pairs the supplied emblem with the approved wordmark", async ({ page }) => {
    await page.goto("/");
    // The light lockup cannot show on the dark theme; the owner approved the emblem beside
    // the wordmark set in the display face (Holo Drop, 2026-09-15). The emblem stays the asset.
    const logo = page.getByRole("link", { name: "GEAR//DROP — vai alla home" });
    await expect(logo.locator("img")).toHaveAttribute("src", /emblem/);
    await expect(logo).toContainText(/gear\/\/drop/i);
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

test.describe("deck case colours", () => {
  test("one card in Accessori opens a page that offers every colour", async ({ page }) => {
    await page.goto("/negozio/accessori");
    const card = page.getByTestId("product-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Porta Deck");
    await expect(card.getByTestId("card-colours")).toContainText("7 colori");

    await card.getByTestId("choose-colour").click();
    await expect(page).toHaveURL(/\/prodotto\/porta-deck-giallo$/);
    await expect(page.getByTestId("variant-current")).toHaveText("Giallo");
    await expect(page.getByTestId("variant-swatch")).toHaveCount(7);

    await page.getByTestId("variant-picker").getByRole("link", { name: "Fucsia" }).click();
    await expect(page).toHaveURL(/\/prodotto\/porta-deck-fucsia$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Porta Deck Fucsia");
    await expect(page.getByTestId("variant-current")).toHaveText("Fucsia");
    // A compatible accessory never passes for a Hasbro product.
    await expect(page.getByTestId("buy-panel")).toContainText("Compatibile Beyblade");
    await expect(page.getByTestId("buy-panel")).toContainText("non è prodotto né certificato da Hasbro");
  });
});

test.describe("catalogue", () => {
  test("lists products and reports a count", async ({ page }) => {
    await page.goto("/negozio");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const count = Number(await page.getByTestId("result-count").innerText());
    expect(count).toBeGreaterThan(0);

    // The count is the whole result, the grid is one page of it. Since the Spain arrival the
    // catalogue no longer fits on a single page, so the rest has to be reachable, not lost.
    const onPage = await page.getByTestId("product-card").count();
    if (onPage === count) {
      await expect(page.getByTestId("pagination")).toHaveCount(0);
      return;
    }

    expect(onPage).toBeLessThan(count);
    await expect(page.getByTestId("pagination")).toBeVisible();
    await page.goto("/negozio?page=2");
    const onSecond = await page.getByTestId("product-card").count();
    expect(onSecond).toBeGreaterThan(0);
    expect(onPage + onSecond).toBeLessThanOrEqual(count);
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
    // A zero-count facet is disabled; since 2026-10-08 an empty shelf reads "esaurito" (no open
    // pre-orders), so that facet is live exactly while the catalogue holds a sold-out piece.
    const soldOut = panel.getByTestId("filter-stock-esaurito");
    if (PRODUCTS.some((product) => product.stock === "esaurito")) await expect(soldOut).toBeEnabled();
    else await expect(soldOut).toBeDisabled();
    // Attack blades and arena sets provide a real, nonempty filter subset.
    await panel.getByTestId("filter-type-attacco").check();
    if (isMobile) await page.getByTestId("filters-apply").click();

    await expect(page.getByTestId("result-count")).not.toHaveText(String(before));
    await expect(page).toHaveURL(/type=attacco/);
    await expect(page.getByTestId("product-card")).toHaveCount(ATTACK_PRODUCT_COUNT);

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
    const dragoon = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!.price.amount;
    await expect(page.getByTestId("pdp-price")).toHaveText(`€${(dragoon / 100).toFixed(2).replace(".", ",")}`);
    await expect(buyPanel(page).getByTestId("add-to-cart")).toBeVisible();
  });

  test("a removed catalogue product cannot still be purchased", async ({ page }) => {
    // All current products are available. The sold-out CTA is covered with an explicit
    // product fixture in preorder-storefront.test.tsx; archived routes must be real 404s.
    const response = await page.goto("/prodotto/phoenix-wing-9-60gf");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);
  });

  test("a product on the shelf adds to the cart, not as a pre-order", async ({ page }) => {
    // Hurricane Enlil still has a shelf; most of the catalogue sells as a pre-order.
    await page.goto("/prodotto/hurricane-enlil-is-7-55t");
    await expect(buyPanel(page).getByTestId("add-to-cart")).toContainText("Aggiungi al carrello");
    await expect(buyPanel(page)).not.toContainText("Pre-ordina");
  });

  test("publishes Product structured data matching the visible price", async ({ page }) => {
    await page.goto("/prodotto/hurricane-enlil-is-7-55t");
    const blocks = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const data = blocks.map((raw) => JSON.parse(raw)).find((item) => item["@type"] === "Product");
    expect(data["@type"]).toBe("Product");
    // The price Google reads is the catalogue's, whatever the owner sets it to.
    const enlil = PRODUCTS.find((product) => product.slug === "hurricane-enlil-is-7-55t")!;
    expect(data.offers.price).toBe((enlil.price.amount / 100).toFixed(2));
    expect(data.offers.availability).toBe("https://schema.org/InStock");

    // A pre-order says so in the same place.
    await page.goto("/prodotto/cobalt-drake-4-60f");
    const preorder = (await page.locator('script[type="application/ld+json"]').allInnerTexts())
      .map((raw) => JSON.parse(raw))
      .find((item) => item["@type"] === "Product");
    expect(preorder.offers.availability).toBe("https://schema.org/PreOrder");
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
    // Two Cobalts in the catalogue since the 2026-09-21 drop, and since 2026-10-05 the Deck
    // Completo that contains one. The search finds all three; the two actually named Cobalt
    // rank above the bundle that only lists one among its contents.
    await page.goto("/ricerca?q=cobalt");
    await expect(page.getByTestId("search-results")).toBeVisible();
    await expect(page.getByTestId("product-card")).toHaveCount(3);
    await expect(page.getByTestId("product-card").nth(0)).toContainText("Cobalt");
    await expect(page.getByTestId("product-card").nth(1)).toContainText("Cobalt");
    await expect(page.getByTestId("search-results")).toContainText("Cobalt Dragoon");
    await expect(page.getByTestId("search-results")).toContainText("Cobalt Drake");
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
