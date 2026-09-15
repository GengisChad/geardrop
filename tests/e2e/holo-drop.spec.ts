import { expect, test } from "@playwright/test";

/**
 * Regression cover for the Holo Drop look: the translucent sticky header, the holographic
 * card interaction and the layering of the header above the hero. The assertions read
 * computed styles, custom properties and real hit-testing, so a refactor that silently drops
 * an effect fails here instead of on the public domain.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1000 },
] as const;

test.describe("holo drop storefront", () => {
  test("the sticky header is a translucent, blurred bar", async ({ page }) => {
    await page.goto("/");

    const material = await page.locator("header").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { backdrop: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor, position: style.position };
    });

    expect(material.backdrop).toMatch(/blur\((?!0px)/);
    // Tailwind mixes `bg-void/80` in oklab; either notation must carry an alpha below 1.
    expect(material.background).toMatch(/(?:rgba\(.*,\s*0?\.\d+\)|\/\s*0?\.\d+\))$/);
    expect(material.position).toBe("sticky");
  });

  test("a catalogue card tilts and lights its foil under the pointer", async ({ page, isMobile }) => {
    test.skip(isMobile, "the pointer effects belong to hover devices; touch gets the automatic sweep");
    await page.goto("/negozio");

    const card = page.getByTestId("product-card").first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const surface = card.locator("xpath=..");
    const shine = surface.locator(".gd-holo-shine");
    await expect(shine).toBeHidden();

    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.6);
    await page.mouse.move(box!.x + box!.width * 0.78, box!.y + box!.height * 0.22, { steps: 6 });

    await expect(shine).toBeVisible();
    await expect.poll(() => surface.evaluate((element) => element.style.getPropertyValue("--o"))).toBe("1");
    await expect.poll(() => surface.evaluate((element) => element.style.getPropertyValue("--ry"))).not.toMatch(/^(0deg)?$/);

    await page.mouse.move(2, 2);
    await expect.poll(() => surface.evaluate((element) => element.style.getPropertyValue("--o"))).toBe("0");
  });

  test("reduced motion keeps the cards still", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer-only behaviour");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/negozio");

    const card = page.getByTestId("product-card").first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const surface = card.locator("xpath=..");
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);
    await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.8, { steps: 6 });

    expect(await surface.evaluate((element) => element.style.getPropertyValue("--ry"))).toBe("");
  });

  for (const viewport of VIEWPORTS) {
    test(`header stays above the hero and the page never scrolls sideways at ${viewport.name}`, async ({ page }, testInfo) => {
      // The sweep sets its own viewport; emulating a phone at 1920px is a combination no
      // real visitor has.
      test.skip(testInfo.project.name !== "desktop", "viewport sweep belongs to one project");

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await expect(page.locator("header").first()).toBeVisible();

      // Scroll the hero under the sticky header, then click through it: Playwright refuses a
      // click another layer covers, so passing proves nothing in the hero paints over it.
      await page.evaluate(() => window.scrollTo(0, 400));
      const target = page.locator("header nav a").first();

      if (await target.isVisible()) {
        await target.click();
        await expect(page).not.toHaveURL(/\/$/);
        await page.goBack();
      } else {
        await expect(page.locator("header button").first()).toBeVisible();
      }

      // Page-level only: the card rails scroll inside their own containers by design.
      const horizontalOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return Math.max(0, root.scrollWidth - root.clientWidth);
      });
      expect(horizontalOverflow).toBeLessThanOrEqual(17);
    });
  }
});
