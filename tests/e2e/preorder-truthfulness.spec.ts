import { expect, test } from "@playwright/test";

test.describe("truthful preorder storefront", () => {
  test("shows the current allocation on the product page and cart", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const buyPanel = page.locator("#buy-panel");
    await expect(buyPanel.getByTestId("preorder-remaining")).toHaveText("10 pre-ordini rimasti");
    await expect(buyPanel.getByTestId("qty-input")).toHaveAttribute("max", "10");
    await buyPanel.getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("preorder-remaining")).toHaveText("10 pre-ordini rimasti");
    await expect(page.getByTestId("qty-input")).toHaveAttribute("max", "10");
  });

  test("omits fabricated home, footer, and zero-review presentation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    await expect(page.getByTestId("product-carousel")).toHaveCount(1);
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
