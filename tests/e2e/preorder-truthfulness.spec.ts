import { expect, test } from "@playwright/test";
import { PRODUCTS } from "../../src/data/catalog";
import { MAX_QUANTITY_PER_LINE } from "../../src/lib/commerce/limits";
import { SHELF_COUNT_SHOWN_UP_TO } from "../../src/lib/labels";

const ENLIL = PRODUCTS.find((product) => product.slug === "hurricane-enlil-is-7-55t")!.availableQuantity!;
/** A deep shelf is availability, not scarcity: past this the page shows no count at all. */
const SHOWS_COUNT = ENLIL <= SHELF_COUNT_SHOWN_UP_TO;
const CAP = String(Math.min(MAX_QUANTITY_PER_LINE, ENLIL));

test.describe("truthful preorder storefront", () => {
  test("shows the current stock on the product page and caps the cart", async ({ page }) => {
    // Hurricane Enlil sells from a real shelf, so the page must state what it can promise:
    // the count while it is short enough to matter, and a cart that never exceeds it.
    await page.goto("/prodotto/hurricane-enlil-is-7-55t");
    const buyPanel = page.locator("#buy-panel");
    if (SHOWS_COUNT) {
      await expect(buyPanel.getByTestId("stock-remaining")).toHaveText(
        `${ENLIL} ${ENLIL === 1 ? "pezzo disponibile" : "pezzi disponibili"}`,
      );
    } else {
      await expect(buyPanel.getByTestId("stock-remaining")).toHaveCount(0);
    }
    await expect(buyPanel.getByTestId("preorder-remaining")).toHaveCount(0);
    await expect(buyPanel.getByTestId("qty-input")).toHaveAttribute("max", CAP);
    await buyPanel.getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("qty-input")).toHaveAttribute("max", CAP);
  });

  test("omits fabricated home, footer, and zero-review presentation", async ({ page }) => {
    await page.goto("/");
    // The homepage: the new releases lead the hero, what ships now follows, then the rest.
    await expect(page.getByRole("heading", { name: "Nuove uscite", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Pronti da spedire" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tutto il resto" })).toBeVisible();
    await expect(page.getByTestId("product-carousel")).toHaveCount(0);
    // The hero says what it deals: the 2026-09-21 drop is a pre-order.
    await expect(page.locator("body")).toContainText("Pre-ordini aperti");
    await expect(page.locator("body")).not.toContainText("Più venduti");
    await expect(page.locator("body")).not.toContainText("GEAR//DROP Club");
    await expect(page.locator("body")).not.toContainText("45.000");
    await expect(page.getByTestId("newsletter-email")).toHaveCount(0);

    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await expect(page.locator("body")).not.toContainText("recensioni");
    await expect(page.locator("#buy-panel").getByTestId("preorder-remaining")).toHaveCount(0);
    const blocks = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const data = blocks.map((raw) => JSON.parse(raw)).find((item) => item["@type"] === "Product");
    expect(data.aggregateRating).toBeUndefined();
  });
});
