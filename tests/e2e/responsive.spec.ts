import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/",
  "/negozio",
  "/negozio/beyblade-x",
  "/prodotto/wizard-arrow-4-80b",
  "/carrello",
  "/checkout",
  "/preferiti",
  "/ricerca?q=shark",
  "/account",
  "/chi-siamo",
  "/assistenza/faq",
  "/legale/privacy",
  "/missing-route",
] as const;

const MATERIAL_SELECTORS = [
  ".gd-glass",
  ".gd-glass-card",
  ".gd-glass-panel",
  ".gd-glass-compact",
  ".gd-glass-dark",
] as const;

const MATERIAL_TOKENS = [
  "--gd-material-fallback",
  "--gd-material-background",
  "--gd-material-border",
  "--gd-material-highlight",
  "--gd-material-shadow",
  "--gd-material-blur",
  "--gd-material-saturation",
  "--gd-material-hover-background",
  "--gd-material-active-background",
  "--gd-material-focus-ring",
] as const;


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
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await page.locator("#buy-panel").scrollIntoViewIfNeeded();
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
    for (const path of ["/", "/negozio", "/prodotto/stadio-beystadium-x-attack-set", "/carrello", "/checkout"]) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} scrolls horizontally`).toBe(false);
    }
  });

  test("public routes do not overflow at required mobile and tablet widths", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      for (const path of PUBLIC_ROUTES) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} overflows at ${viewport.width}px`).toBeLessThanOrEqual(1);
      }
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

  test("all five material tiers expose the shared material tokens", async ({ page }) => {
    await page.goto("/");

    const materials = await page.evaluate(
      ({ selectors, tokens }) =>
        selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing material surface: ${selector}`);
          const style = getComputedStyle(element);
          const backdrop = [
            style.getPropertyValue("backdrop-filter"),
            style.getPropertyValue("-webkit-backdrop-filter"),
          ].find((value) => value && value !== "none") ?? "none";
          return {
            selector,
            tokenValues: tokens.map((token) => style.getPropertyValue(token).trim()),
            backdrop,
            border: style.borderTopWidth,
            background: style.backgroundColor,
          };
        }),
      { selectors: MATERIAL_SELECTORS, tokens: MATERIAL_TOKENS },
    );

    for (const material of materials) {
      expect(material.tokenValues, `${material.selector} exposes every token`).not.toContain("");
      expect(material.backdrop, `${material.selector} enables backdrop filtering`).not.toBe("none");
      expect(material.border, `${material.selector} has a rim`).not.toBe("0px");
      expect(material.background, `${material.selector} has a fallback`).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("public surfaces use their assigned liquid glass tier", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "geardrop.cart",
        JSON.stringify({ state: { lines: [{ slug: "wizard-arrow-4-80b", quantity: 1 }] }, version: 1 }),
      );
    });

    const surfaces = [
      ["/", "[data-testid='hero-glass']", "gd-glass"],
      ["/", "[data-testid='bundle-glass']", "gd-glass-dark"],
      ["/", "[data-testid='club-glass']", "gd-glass"],
      ["/", "[data-testid='status-legend']", "gd-glass-compact"],
      ["/negozio", "[data-testid='catalog-hero']", "gd-glass"],
      ["/negozio", "[data-testid='filters-panel']", "gd-glass-panel"],
      ["/prodotto/wizard-arrow-4-80b", "[data-testid='product-gallery']", "gd-glass-panel"],
      ["/prodotto/wizard-arrow-4-80b", "[data-testid='buy-panel']", "gd-glass-panel"],
      ["/carrello", "[data-testid='cart-summary']", "gd-glass-panel"],
      ["/checkout", "[data-testid='checkout-summary']", "gd-glass-panel"],
      ["/preferiti", "[data-testid='wishlist-surface']", "gd-glass-panel"],
      ["/ricerca?q=shark", "[data-testid='search-surface']", "gd-glass-panel"],
      ["/assistenza/faq", "[data-testid='content-page']", "gd-glass-panel"],
      ["/missing-route", "[data-testid='not-found-glass']", "gd-glass"],
    ] as const;

    for (const [route, selector, tier] of surfaces) {
      await page.goto(route);
      const surface = page.locator(selector);
      await expect(surface, `${route} exposes ${selector}`).toHaveCount(1);
      await expect(surface).toHaveClass(new RegExp(`(?:^|\\s)${tier}(?:\\s|$)`));
      const backdrop = await surface.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.getPropertyValue("backdrop-filter"),
          style.getPropertyValue("-webkit-backdrop-filter"),
        ].find((value) => value && value !== "none") ?? "none";
      });
      expect(backdrop, `${route} has active backdrop filtering`).not.toBe("none");
    }
  });

  test("reduced motion disables material lift and ambient animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const motion = await page.locator(".gd-glass-interactive").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { transition: style.transitionDuration, animation: style.animationDuration };
    });
    expect(motion.transition).toBe("0s");
    expect(motion.animation).toBe("0s");
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
    const routes = ["/", "/negozio", "/prodotto/wizard-arrow-4-80b", "/carrello", "/checkout", "/account"];

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
    await page.getByTestId("search-input").fill("shark");
    await page.getByTestId("search-input").press("Enter");
    await expect(page).toHaveURL(/\/ricerca\?q=shark/);
    await expect(page.getByTestId("product-card").first()).toContainText("Shark Edge");
  });
});

test.describe("accessibility basics", () => {
  test("every page has exactly one h1", async ({ page }) => {
    for (const path of ["/", "/negozio", "/prodotto/wizard-arrow-4-80b", "/carrello", "/preferiti", "/chi-siamo"]) {
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

  test("glass action targets preserve a 44px touch area", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");

    const galleryWishlist = page.getByTestId("product-gallery").getByTestId("wishlist-toggle");
    await expect(galleryWishlist).toHaveCount(1);

    await page.locator("#buy-panel").getByTestId("add-to-cart").click();
    const toastDismiss = page.getByRole("button", { name: "Chiudi notifica" });
    await expect(toastDismiss).toBeVisible();

    for (const control of [galleryWishlist, toastDismiss]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
