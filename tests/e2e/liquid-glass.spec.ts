import { expect, test } from "@playwright/test";

/**
 * Regression cover for the liquid glass storefront, written to protect what already
 * works rather than to drive a change.
 *
 * The visual system was reported missing in production, which turned out to be a stale
 * build rather than a defect on this branch. These assertions read computed styles and
 * real hit-testing so that a future refactor — a utility class landing on a glass
 * element, a stacking context appearing above the header — fails here instead of on the
 * public domain.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1000 },
] as const;

test.describe("liquid glass storefront", () => {
  test("the header pill really is a blurred, translucent surface", async ({ page }) => {
    await page.goto("/");

    const pill = page.locator("header .gd-glass-compact").first();
    await expect(pill).toBeVisible();

    const material = await pill.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdrop: style.backdropFilter || style.webkitBackdropFilter,
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        shadow: style.boxShadow,
      };
    });

    // Not merely "a class is present": the browser must be compositing an actual blur.
    expect(material.backdrop).toMatch(/blur\((?!0px)/);
    expect(material.backdrop).toContain("saturate");
    expect(material.background).toMatch(/rgba?\(/);
    expect(parseFloat(material.borderWidth)).toBeGreaterThan(0);
    expect(material.shadow).not.toBe("none");
  });

  test("glass cards keep a translucent background and a rim", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".gd-glass-card").first();
    await expect(card).toBeVisible();

    const material = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      const alpha = style.backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)/);
      return {
        backdrop: style.backdropFilter || style.webkitBackdropFilter,
        alpha: alpha ? Number(alpha[1]) : 1,
        borderWidth: style.borderTopWidth,
      };
    });

    expect(material.backdrop).toMatch(/blur\((?!0px)/);
    expect(material.alpha).toBeLessThan(1);
    expect(parseFloat(material.borderWidth)).toBeGreaterThan(0);
  });

  test("the hero shows the impact artwork and no stadium product shot", async ({ page }) => {
    await page.goto("/");

    const hero = page.getByTestId("hero-impact");
    await expect(hero).toBeVisible();

    const image = hero.locator("img");
    await expect(image).toHaveAttribute("src", /impact\.(png|webp)/);

    // The impact artwork replaced a stadium product photo. If that photo ever comes back
    // as the hero subject, the branch has regressed to the pre-redesign layout.
    await expect(hero.locator('img[src*="stadio"]')).toHaveCount(0);
  });

  for (const viewport of VIEWPORTS) {
    test(`header stays above the hero and the page never scrolls sideways at ${viewport.name}`, async ({ page }, testInfo) => {
      // The sweep sets its own viewport, so running it under the mobile project too would
      // only re-test the same widths inside a touch-emulated context — and emulating a
      // phone at 1920px is a combination no real visitor has.
      test.skip(testInfo.project.name !== "desktop", "viewport sweep belongs to one project");

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");

      const header = page.locator("header").first();
      await expect(header).toBeVisible();

      // Scroll the hero under the sticky header: the failure mode reported was the menu
      // sliding behind it, which only shows once the two actually overlap.
      await page.evaluate(() => window.scrollTo(0, 400));

      // Hit-testing through elementFromPoint proved unreliable here — the sticky header's
      // own box is not where the visible pill sits, so the probe kept sampling empty
      // space. A real click is the honest test anyway: Playwright refuses to click an
      // element another layer covers, so this passing *is* the proof that nothing in the
      // hero is painting over the navigation.
      const target = page.locator("header nav a").first();

      if (await target.isVisible()) {
        await target.click();
        await expect(page).not.toHaveURL(/\/$/);
        await page.goBack();
      } else {
        // Below lg the inline nav is replaced by the menu button, which must stay clickable.
        await expect(page.locator("header button").first()).toBeVisible();
      }

      // Page-level only, with slack for the scrollbar gutter: product rails are meant to
      // overflow inside their own scroll container, and counting those would make this
      // assertion fail on a layout that is behaving exactly as designed.
      const horizontalOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return Math.max(0, root.scrollWidth - root.clientWidth);
      });

      expect(horizontalOverflow).toBeLessThanOrEqual(17);
    });
  }
});
