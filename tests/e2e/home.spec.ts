import { expect, test } from "@playwright/test";
import { STOREFRONT_CATALOGUE } from "../../src/lib/commerce/mock-provider";
import { oneCardPerFamily } from "../../src/lib/commerce/variants";
import { homepagePlan } from "../../src/lib/home/product-selection";

/**
 * The public homepage on the default (mock) gate — the Holo Drop composition served when no
 * managed CMS content is published. The managed path is covered against the real database in
 * tests/e2e/supabase-public; this pins the fallback and the responsive behaviour both share.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "small-tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 800 },
  { name: "wide-laptop", width: 1280, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1000 },
] as const;

/** Every card of the storefront: an item sold in several colours (the deck case) is one card. */
const STOREFRONT_CARDS = oneCardPerFamily(STOREFRONT_CATALOGUE);
/** The owner's order: four new releases on sale, what ships now, then the rest. */
const PLAN = homepagePlan(STOREFRONT_CARDS, 5);
const slugs = (products: readonly { readonly slug: string }[]) => products.map((product) => product.slug);
const ATTACK_COUNT = PLAN.rest.filter((product) => product.bladeType === "attacco").length;

test.describe("public homepage", () => {
  test("renders the Holo Drop composition, never the placeholder scaffold", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    // The owner removed the scrolling lime ticker (2026-09-16): it must not come back.
    await expect(page.getByTestId("ticker")).toHaveCount(0);

    // One h1 in three typed lines; the closing line wears the holographic accent.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    const lines = h1.locator("span.block");
    await expect(lines).toHaveCount(3);
    await expect(lines.last()).toHaveText("disponibili in Italia.");
    await expect(lines.last()).toHaveClass(/gd-holo-text/);

    // The hero deals the new releases on sale as product cards, right under the pitch.
    const cardSlugs = (testId: string) =>
      page.getByTestId(testId).getByTestId("product-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-slug")));
    expect(await cardSlugs("hero-products")).toEqual(slugs(PLAN.hero));
    expect(await cardSlugs("ready-to-ship")).toEqual(slugs(PLAN.ready));
    expect(await cardSlugs("arsenal-grid")).toEqual(slugs(PLAN.rest));

    // The page carries the whole catalogue exactly once, and nothing moves on its own.
    const productCards = page.getByTestId("product-card");
    await expect(productCards).toHaveCount(STOREFRONT_CARDS.length);
    await expect(page.getByTestId("arena")).toHaveCount(0);
    await expect(page.getByTestId("holo-card")).toHaveCount(0);
    await expect(page.getByTestId("product-carousel")).toHaveCount(0);

    await expect(page.locator("body")).not.toContainText("target relazionali");
    expect(await page.locator("section.bg-graphite").count()).toBe(0);

    const blurred = await page.locator("header").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return (style.backdropFilter || style.webkitBackdropFilter || "").includes("blur");
    });
    expect(blurred).toBe(true);
  });

  test("the arsenal filters by type in place", async ({ page }) => {
    await page.goto("/");
    const grid = page.getByTestId("arsenal-grid");
    const visibleCards = grid.locator("li:not([hidden]) [data-testid='product-card']");

    await page.getByTestId("arsenal").getByRole("button", { name: /^Attacco/ }).click();
    await expect(visibleCards).toHaveCount(ATTACK_COUNT);

    await page.getByTestId("arsenal").getByRole("button", { name: /^Tutti/ }).click();
    await expect(visibleCards).toHaveCount(PLAN.rest.length);
  });

  test("a new release goes to the cart straight from the hero", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("hero-products").getByTestId("add-to-cart").first().click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  for (const viewport of VIEWPORTS) {
    test(`no horizontal overflow and a clickable header at ${viewport.name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "viewport sweep belongs to one project");

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return Math.max(0, root.scrollWidth - root.clientWidth);
      });
      expect(overflow, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);

      // The hero never pushes the page wider than the viewport.
      const heroClipped = await page.getByTestId("hero").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.right > window.innerWidth + 1 || box.left < -1;
      });
      expect(heroClipped, `hero wider than the viewport at ${viewport.width}px`).toBe(false);

      // A navigation control is reachable: the inline link above lg, the menu button below.
      const navLink = page.locator("header nav a").first();
      if (await navLink.isVisible()) {
        await navLink.click();
        await expect(page).not.toHaveURL(/\/$/);
      } else {
        await expect(page.locator("header button").first()).toBeVisible();
      }
    });
  }
});
