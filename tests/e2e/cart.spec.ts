import { expect, test, type Page } from "@playwright/test";

/** A PDP also renders "Si abbina bene con" cards, which carry the same testids. */
const buyPanel = (page: Page) => page.locator("#buy-panel");

test.describe("cart", () => {
  test("adding from a card updates the header count", async ({ page }) => {
    await page.goto("/negozio");
    await expect(page.getByTestId("cart-count")).toHaveCount(0);

    await page.getByTestId("product-card").first().getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("the cart label agrees in number", async ({ page }) => {
    await page.goto("/negozio");
    await expect(page.getByTestId("cart-link")).toHaveAttribute("aria-label", "Carrello, vuoto");

    const cards = page.getByTestId("product-card");
    await cards.nth(0).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-link")).toHaveAttribute("aria-label", "Carrello, 1 articolo");

    await cards.nth(1).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-link")).toHaveAttribute("aria-label", "Carrello, 2 articoli");
  });

  test("the cart survives a reload", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("adding the same product twice increments one line instead of duplicating it", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await buyPanel(page).getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("qty-input")).toHaveValue("2");
    await expect(page.getByTestId("line-total")).toHaveText("€49,98");
  });

  test("quantity drives the line total and the cart total", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("line-total")).toHaveText("€49,98");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("€49,98");
  });

  test("shipping is charged below 59€ and free at or above it", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    // 1 x 24,99 -> below the threshold
    await expect(page.getByTestId("cart-shipping")).toHaveText("€4,90");
    await expect(page.getByTestId("cart-total")).toHaveText("€29,89");

    // 3 x 24,99 = 74,97 -> free shipping
    await page.getByTestId("qty-increase").click();
    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("cart-shipping")).toHaveText("Gratis");
    await expect(page.getByTestId("cart-total")).toHaveText("€74,97");
  });

  test("removing the last line shows the empty state", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await page.getByTestId("cart-remove").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });

  test("an empty cart shows the empty state, never a stale count", async ({ page }) => {
    await page.goto("/carrello");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("a cart holding a product that no longer exists does not break the page", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "geardrop.cart",
        JSON.stringify({ state: { lines: [{ slug: "prodotto-cancellato", quantity: 2 }] }, version: 1 }),
      );
    });
    await page.goto("/carrello");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});

test.describe("wishlist", () => {
  test("saving a product persists it to the wishlist page", async ({ page }) => {
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").first();
    const slug = await card.getAttribute("data-slug");
    await card.getByTestId("wishlist-toggle").click();

    await page.goto("/preferiti");
    await expect(page.getByTestId("wishlist-grid")).toBeVisible();
    await expect(page.getByTestId("product-card")).toHaveAttribute("data-slug", slug!);
  });

  test("toggling twice removes it again", async ({ page }) => {
    await page.goto("/negozio");
    const toggle = page.getByTestId("product-card").first().getByTestId("wishlist-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await page.goto("/preferiti");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});

test.describe("checkout", () => {
  test("blocks submission and reports errors when the form is empty", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("order-confirmation")).toHaveCount(0);
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("rejects a malformed CAP", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.locator("#postalCode").fill("123");
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Il CAP deve essere di 5 cifre.")).toBeVisible();
  });

  test("completes an order and empties the cart", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.locator("#email").fill("mario.rossi@email.it");
    await page.locator("#phone").fill("+39 333 1234567");
    await page.locator("#firstName").fill("Mario");
    await page.locator("#lastName").fill("Rossi");
    await page.locator("#address").fill("Via Roma 1");
    await page.locator("#city").fill("Milano");
    await page.locator("#postalCode").fill("20121");
    await page.locator("#province").fill("MI");

    await page.getByTestId("place-order").click();

    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });

  test("express shipping adds its surcharge to the total", async ({ page }) => {
    await page.goto("/prodotto/wizard-arrow-4-80b");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    // 24,99 + 4,90 shipping = 29,89; express adds 6,90.
    await expect(page.getByTestId("cart-total")).toHaveText("€29,89");
    await page.getByRole("radio", { name: /Express/ }).check();
    await expect(page.getByTestId("cart-total")).toHaveText("€36,79");
  });

  test("checkout with an empty cart offers nothing to pay for", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("checkout-form")).toHaveCount(0);
  });
});
