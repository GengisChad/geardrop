import { expect, test, type Page } from "@playwright/test";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS } from "../../src/data/catalog";

/**
 * The X-Rail motion set (owner, 2026-10-29): motion carries state and feedback, runs once and
 * settles, and stops for reduced motion. Prices are read off the catalogue, never typed.
 */
const DRAGOON = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!.price.amount;
const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
const TEETH = 20;
const litFor = (cents: number) => Math.min(TEETH, Math.floor((cents / FREE_SHIPPING_THRESHOLD) * TEETH));
const FREE_FROM = Math.ceil(FREE_SHIPPING_THRESHOLD / DRAGOON);

const buyPanel = (page: Page) => page.locator("#buy-panel");
const meter = (page: Page) => page.getByTestId("free-shipping-meter");

test.describe("free-shipping meter", () => {
  test("lights a tooth for every twentieth of the threshold and unlocks at it", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await expect(meter(page).locator("[data-tooth]")).toHaveCount(TEETH);
    await expect(meter(page).locator('[data-lit="true"]')).toHaveCount(litFor(DRAGOON));
    await expect(meter(page)).toContainText(`Ancora ${euro(FREE_SHIPPING_THRESHOLD - DRAGOON)} e la spedizione è gratis.`);

    for (let click = 1; click < FREE_FROM; click += 1) {
      await page.getByTestId("qty-increase").click();
      await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * (click + 1)));
    }
    await expect(meter(page).locator('[data-lit="true"]')).toHaveCount(TEETH);
    await expect(meter(page).locator('[data-reached="true"]')).toHaveCount(1);
    await expect(meter(page)).toContainText("Spedizione gratuita sbloccata.");
    await expect(meter(page).getByText("Spedizione gratis", { exact: true })).toBeVisible();
  });

  test("the add toast says what is really missing, from the server's quote", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await expect(page.getByText(`Ancora ${euro(FREE_SHIPPING_THRESHOLD - DRAGOON)} per la spedizione gratis`)).toBeVisible();
  });
});
