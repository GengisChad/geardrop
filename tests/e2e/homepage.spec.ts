import { expect, test } from "@playwright/test";

/**
 * The public homepage, on the default (mock) gate — the composition served when no
 * managed CMS content is published. The managed path is covered against the real
 * database in tests/e2e/supabase-public; this pins the fallback and the responsive
 * behaviour that both paths share.
 *
 * The point of reference is the black page that shipped: a graphite scaffold of headings
 * reading "N target relazionali" instead of the liquid glass storefront. These assertions
 * fail if any of that returns.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "small-tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 800 },
  { name: "wide-laptop", width: 1280, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1000 },
] as const;

test.describe("public homepage", () => {
  test("renders the full liquid glass composition, never the placeholder scaffold", async ({ page }) => {
    await page.goto("/");

    // The intro is gone: the storefront paints immediately, nothing in front of it.
    await expect(page.getByTestId("site-intro")).toHaveCount(0);

    // Hero: impact artwork inside the glass card, no stadium product shot as the subject.
    await expect(page.getByTestId("hero-glass")).toBeVisible();
    const heroImage = page.getByTestId("hero-impact").locator("img");
    await expect(heroImage).toHaveAttribute("src", /impact\.(png|webp)/);
    await expect(page.getByTestId("hero-impact").locator('img[src*="stadio"]')).toHaveCount(0);

    // Exactly one h1, and it is the hero's.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    // The headline is three typed lines and the last one carries the lime accent — the
    // graphite-only title from the reported screenshot must not come back.
    const h1 = page.getByRole("heading", { level: 1 });
    const lines = h1.locator("span.block");
    await expect(lines).toHaveCount(3);
    await expect(lines.last()).toHaveText("Nati per vincere.");
    const accentIsLime = await lines.last().evaluate((el) => {
      const lime = getComputedStyle(el).color;
      const graphite = getComputedStyle(el.parentElement!.querySelector("span.block")!).color;
      return lime !== graphite;
    });
    expect(accentIsLime, "the accent line is not distinct from the graphite lines").toBe(true);

    // HeroImpact is unchanged: still the impact artwork inside the hero.
    await expect(page.getByTestId("hero-impact").locator("img")).toHaveAttribute("src", /impact\.(png|webp)/);

    // None of the placeholder scaffold: no relation-count text, no full graphite section.
    await expect(page.locator("body")).not.toContainText("target relazionali");
    expect(await page.locator("section.bg-graphite").count()).toBe(0);

    // The real sections rendered: a visible tile links to each category (the mobile menu
    // carries the same links hidden, so scope to the visible one), plus product cards.
    for (const slug of ["beyblade-x", "lanciatori", "stadi", "accessori"]) {
      await expect(page.locator(`a[href="/negozio/${slug}"]:visible`).first()).toBeVisible();
    }
    expect(await page.getByTestId("product-card").count()).toBeGreaterThan(0);

    // Glass actually composites a blur, not just a class name.
    const blurred = await page.locator('[class*="gd-glass"]').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return (style.backdropFilter || style.webkitBackdropFilter || "").includes("blur");
    });
    expect(blurred).toBe(true);
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

      // The hero must not be clipped: its glass card is fully within the viewport width.
      const heroClipped = await page.getByTestId("hero-glass").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.right > window.innerWidth + 1 || box.left < -1;
      });
      expect(heroClipped, `hero clipped at ${viewport.width}px`).toBe(false);

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
