import { expect, test } from "@playwright/test";

test.describe("truthful preorder storefront", () => {
  test("shows the current stock on the product page and caps the cart", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const buyPanel = page.locator("#buy-panel");
    await expect(buyPanel.getByTestId("stock-remaining")).toHaveText("10 pezzi disponibili");
    await expect(buyPanel.getByTestId("preorder-remaining")).toHaveCount(0);
    await expect(buyPanel.getByTestId("qty-input")).toHaveAttribute("max", "10");
    await buyPanel.getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("qty-input")).toHaveAttribute("max", "10");
  });

  test("omits fabricated home, footer, and zero-review presentation", async ({ page }) => {
    await page.goto("/");
    // The Holo Drop homepage: the new releases lead the hero, the whole catalogue follows.
    await expect(page.getByRole("heading", { name: "Nuove uscite", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Tutto il drop" })).toBeVisible();
    await expect(page.getByTestId("product-carousel")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pre-ordini aperti" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Più venduti");
    await expect(page.locator("body")).not.toContainText("GEAR//DROP Club");
    await expect(page.locator("body")).not.toContainText("45.000");
    await expect(page.getByTestId("newsletter-email")).toHaveCount(0);

    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await expect(page.locator("body")).not.toContainText("recensioni");
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    expect(data.aggregateRating).toBeUndefined();
  });
});
