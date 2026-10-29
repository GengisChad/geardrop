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

test.describe("X-Rail touches", () => {
  test("an add cuts light across the button and relaunches the header emblem", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const launches = page.locator("header [data-launches]").first();
    await expect(launches).toHaveAttribute("data-launches", "0");

    const add = buyPanel(page).getByTestId("add-to-cart");
    await add.click();
    await expect(add).toHaveClass(/gd-cut/);
    expect(await add.evaluate((element) => getComputedStyle(element, "::after").animationName)).toBe("gd-slab");
    await expect(launches).toHaveAttribute("data-launches", "1");
  });

  test("a stored cart does not relaunch the emblem when the page opens", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(page.locator("header [data-launches]").first()).toHaveAttribute("data-launches", "0");
  });

  test("promo stickers ride their card's scroll timeline", async ({ page }) => {
    await page.goto("/negozio");
    const sticker = page.getByTestId("product-card").locator(".gd-sticker-land").first();
    await expect(sticker).toBeAttached();
    expect(await sticker.evaluate((element) => getComputedStyle(element).animationTimeline)).toBe("--gd-card");
  });

  test("the part number slides in once behind the packshot", async ({ page }) => {
    await page.goto("/prodotto/soar-phoenix-9-60gf");
    const mark = page.getByTestId("product-gallery").locator(".gd-watermark");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationName)).toBe("gd-mark-in");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationIterationCount)).toBe("1");
  });
});

test.describe("reduced motion", () => {
  test("keeps every new animation still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const mark = page.getByTestId("product-gallery").locator(".gd-watermark");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    const add = buyPanel(page).getByTestId("add-to-cart");
    await add.click();
    expect(await add.evaluate((element) => getComputedStyle(element, "::after").animationDuration)).toBe("0s");

    await page.goto("/negozio");
    const sticker = page.getByTestId("product-card").locator(".gd-sticker-land").first();
    expect(await sticker.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    await page.goto("/carrello");
    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * 2));
    const lit = meter(page).locator('[data-lit="true"]');
    await expect(lit).toHaveCount(litFor(DRAGOON * 2));
    const names = await lit.evaluateAll((teeth) => teeth.map((tooth) => getComputedStyle(tooth).animationName));
    expect(new Set(names)).toEqual(new Set(["none"]));
  });
});
