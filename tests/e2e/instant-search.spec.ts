import { expect, test } from "@playwright/test";

/**
 * Instant-search combobox in the header.
 *
 * These tests cover the new panel that appears while the user types; the
 * existing `responsive.spec.ts` keeps the Enter-submits-to-/ricerca contract.
 * Because the suite runs against the production build with the mock provider,
 * "cobalt" reliably matches Cobalt Drake and Cobalt Dragoon.
 */

test.describe("instant search — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("empty query shows the quick-links panel", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    // The panel should appear immediately without typing
    await expect(page.getByTestId("search-panel")).toBeVisible();
    await expect(page.getByTestId("search-panel")).toContainText("Beyblade X");
    await expect(page.getByTestId("search-panel")).toContainText("Nuovi arrivi");
  });

  test("typing shows result rows with name and price", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    // Wait for the debounce + server fetch (up to 3s is generous for the mock provider)
    await expect(page.getByTestId("search-panel")).toContainText("Cobalt", { timeout: 3_000 });
    // Price appears as a Euro-formatted string
    await expect(page.getByTestId("search-panel")).toContainText("€");
    // "Vedi tutti" footer appears
    await expect(page.getByTestId("search-panel")).toContainText("Vedi tutti");
  });

  test("ArrowDown + Enter navigates to the highlighted product page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    // Wait for results to arrive
    await expect(page.getByTestId("search-panel")).toContainText("Cobalt", { timeout: 3_000 });
    // Move focus to the first option and confirm
    await page.getByTestId("search-input").press("ArrowDown");
    await page.getByTestId("search-input").press("Enter");
    // Should navigate to a product page
    await expect(page).toHaveURL(/\/prodotto\//);
  });

  test("Escape closes the panel and returns focus to the toggle", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    await expect(page.getByTestId("search-panel")).toBeVisible();
    await page.getByTestId("search-input").press("Escape");
    await expect(page.getByTestId("search-panel")).toBeHidden();
    // Toggle button regains focus after Escape
    await expect(page.getByTestId("search-toggle")).toBeFocused();
  });

  test("Enter without active option navigates to /ricerca (existing contract)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    // Do NOT press ArrowDown — submit with Enter directly
    await page.getByTestId("search-input").press("Enter");
    await expect(page).toHaveURL(/\/ricerca\?q=cobalt/);
  });

  test("clicking a result row navigates to the product page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    await expect(page.getByTestId("search-panel")).toContainText("Cobalt", { timeout: 3_000 });
    // Click the first result row (first role=option that is a product link)
    const panel = page.getByTestId("search-panel");
    const firstOption = panel.getByRole("option").first();
    await firstOption.click();
    await expect(page).toHaveURL(/\/prodotto\//);
  });

  test("no-results message when the query matches nothing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("xzxzxzxz");
    await expect(page.getByTestId("search-panel")).toContainText("Nessun risultato", { timeout: 3_000 });
    await expect(page.getByTestId("search-panel")).toContainText("catalogo");
  });

  test("clicking outside the panel closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await expect(page.getByTestId("search-panel")).toBeVisible();
    // Click somewhere in the body that is not the panel or input
    await page.click("body", { position: { x: 100, y: 500 } });
    await expect(page.getByTestId("search-panel")).toBeHidden();
  });
});

test.describe("instant search — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("empty query shows the full-width quick-links sheet", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    const panel = page.getByTestId("search-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Beyblade X");
    // The sheet must span the full viewport width on mobile
    const box = await panel.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.x).toBeLessThanOrEqual(1); // starts at the left edge
      expect(box.width).toBeGreaterThan(360); // effectively full-width
    }
  });

  test("typing reveals results in the sheet", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    await expect(page.getByTestId("search-panel")).toContainText("Cobalt", { timeout: 3_000 });
    await expect(page.getByTestId("search-panel")).toContainText("€");
  });

  test("Enter without active option navigates to /ricerca on mobile too", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("cobalt");
    await page.getByTestId("search-input").press("Enter");
    await expect(page).toHaveURL(/\/ricerca\?q=cobalt/);
  });
});
