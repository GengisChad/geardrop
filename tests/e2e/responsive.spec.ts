import { expect, test } from "@playwright/test";

/** Behaviours the mockups define per breakpoint. See docs/reference-audit.md §6. */

test.describe("mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only behaviour");

  test("shows the bottom tab bar and hides the desktop nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("bottom-tab-bar")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigazione principale" })).toBeHidden();
  });

  test("the hamburger opens the menu and a link closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mobile-menu-open").click();
    const menu = page.getByTestId("mobile-menu");
    await expect(menu).toBeVisible();

    await menu.getByRole("link", { name: "Stadi" }).click();
    await expect(page).toHaveURL(/\/negozio\/stadi/);
    await expect(menu).toBeHidden();
  });

  test("filters open in a sheet rather than a sidebar", async ({ page }) => {
    await page.goto("/negozio");
    await page.getByTestId("filters-open").click();
    await expect(page.getByTestId("filters-sheet")).toBeVisible();
    await page.getByTestId("filters-apply").click();
    await expect(page.getByTestId("filters-sheet")).toBeHidden();
  });

  test("the sticky buy bar appears once the main CTA scrolls away", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await expect(page.getByTestId("sticky-buy-bar")).toBeHidden();

    await page.getByRole("heading", { name: "Si abbina bene con" }).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("sticky-buy-bar")).toBeVisible();
  });

  test("card prices are never clipped by the card at 375px", async ({ page }) => {
    // A two-column card is ~170px wide here; the price must survive it intact.
    await page.goto("/negozio");
    const clipped = await page.getByTestId("card-price").evaluateAll((nodes) =>
      nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
    );
    expect(clipped).toEqual([]);

    for (const text of await page.getByTestId("card-price").allInnerTexts()) {
      expect(text).toMatch(/^€\d+,\d{2}$/);
    }
  });

  test("no page scrolls sideways at 375px", async ({ page }) => {
    for (const path of ["/", "/negozio", "/prodotto/drop-attack-battle-set", "/carrello", "/checkout"]) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} scrolls horizontally`).toBe(false);
    }
  });
});

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop-only behaviour");

  test("liquid glass tiers preserve hierarchy", async ({ page }) => {
    await page.goto("/");

    const styles = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing glass surface: ${selector}`);
        const style = getComputedStyle(element);
        const alphaMatch = style.backgroundColor.match(/\/\s*([\d.]+)\s*\)|,\s*([\d.]+)\s*\)$/);
        const alpha = Number(alphaMatch?.[1] ?? alphaMatch?.[2] ?? 1);
        const backdrop = [
          style.getPropertyValue("backdrop-filter"),
          style.getPropertyValue("-webkit-backdrop-filter"),
        ].find(
          (value) => value && value !== "none",
        );
        return {
          alpha,
          backdrop: backdrop ?? "none",
          border: style.borderTopWidth,
        };
      };

      return {
        display: read(".gd-glass"),
        card: read(".gd-glass-card"),
        panel: read(".gd-glass-panel"),
      };
    });

    expect(styles.display.backdrop).not.toBe("none");
    expect(styles.card.backdrop).not.toBe("none");
    expect(styles.panel.backdrop).not.toBe("none");
    expect(styles.display.border).not.toBe("0px");
    expect(styles.display.alpha).toBeLessThan(styles.card.alpha);
    expect(styles.card.alpha).toBeLessThan(styles.panel.alpha);
  });

  test("hero artwork is dominant without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    const heroBox = await page.getByTestId("hero-glass").boundingBox();
    const impactBox = await page.getByTestId("hero-impact").boundingBox();
    expect(heroBox).not.toBeNull();
    expect(impactBox).not.toBeNull();
    expect(impactBox!.width / heroBox!.width).toBeGreaterThanOrEqual(0.42);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("storefront routes share the liquid glass vocabulary", async ({ page }) => {
    const routes = ["/", "/negozio", "/prodotto/cobalt-dragoon-2-60c", "/carrello", "/checkout", "/account"];

    for (const route of routes) {
      await page.goto(route);
      const surfaces = page.locator(".gd-glass-card, .gd-glass-panel, .gd-glass-compact");
      const count = await surfaces.count();
      expect(count, `${route} has a shared glass surface`).toBeGreaterThan(0);
      const backdrop = await surfaces.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.getPropertyValue("backdrop-filter"),
          style.getPropertyValue("-webkit-backdrop-filter"),
        ].find((value) => value && value !== "none") ?? "none";
      });
      expect(backdrop, `${route} has active backdrop filtering`).not.toBe("none");
    }
  });

  test("shows the nav and hides the mobile tab bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigazione principale" })).toBeVisible();
    await expect(page.getByTestId("bottom-tab-bar")).toBeHidden();
  });

  test("the filter sidebar is present without opening a sheet", async ({ page }) => {
    await page.goto("/negozio");
    await expect(page.getByTestId("filters").first()).toBeVisible();
    await expect(page.getByTestId("filters-open")).toBeHidden();
  });

  test("header search navigates to the results page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    await page.getByTestId("search-input").press("Enter");
    await expect(page).toHaveURL(/\/ricerca\?q=cobalt/);
    await expect(page.getByTestId("product-card").first()).toContainText("Cobalt Dragoon");
  });
});

test.describe("accessibility basics", () => {
  test("every page has exactly one h1", async ({ page }) => {
    for (const path of ["/", "/negozio", "/prodotto/cobalt-dragoon-2-60c", "/carrello", "/preferiti", "/chi-siamo"]) {
      await page.goto(path);
      await expect(page.locator("h1"), `${path} h1 count`).toHaveCount(1);
    }
  });

  test("the skip link is reachable by keyboard", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Salta al contenuto" })).toBeFocused();
  });

  test("product images all carry alt text", async ({ page }) => {
    await page.goto("/negozio");
    const missing = await page
      .getByTestId("product-card")
      .locator("img")
      .evaluateAll((imgs) => imgs.filter((img) => !img.getAttribute("alt") && img.getAttribute("aria-hidden") !== "true").length);
    expect(missing).toBe(0);
  });
});
