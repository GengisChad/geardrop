import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/**
 * The real order path, against the ephemeral Supabase stack.
 *
 * The mock-mode gate in tests/e2e/cart.spec.ts proves the checkout refuses when there is
 * no backend; this proves it actually registers an order when there is one — and that
 * every number on screen came from the database.
 *
 * Not covered here: the signed-in customer flow. The storefront has no customer login
 * yet (see the account page), so a browser session cannot be established. Order
 * attribution for authenticated buyers is proven at the database boundary instead, in
 * supabase/tests/023_storefront_checkout_boundaries.test.sql.
 */

const run = process.env.STOREFRONT_E2E_RUN ?? "";
const slug = `checkout-product-${run}`;

function sql(statement: string): string {
  return execFileSync(
    "psql",
    [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--command",
      statement,
    ],
    { encoding: "utf8" },
  ).trim();
}

/**
 * Seeds the cart once per context. Init scripts re-run on every navigation, so without
 * the marker a reload would silently refill a cart the checkout had just emptied — and
 * the assertions about clearing and preserving it would both pass for the wrong reason.
 */
async function seedCart(page: Page, quantity: number) {
  await page.addInitScript(
    ([cartSlug, cartQuantity]) => {
      const marker = "geardrop.cart.seeded";
      if (window.sessionStorage.getItem(marker) !== null) return;
      window.sessionStorage.setItem(marker, "true");
      window.localStorage.setItem(
        "geardrop.cart",
        JSON.stringify({ state: { lines: [{ slug: cartSlug, quantity: cartQuantity }] }, version: 1 }),
      );
    },
    [slug, quantity] as const,
  );
}

async function fillContact(page: Page, email: string) {
  await page.locator("#email").fill(email);
  await page.locator("#phone").fill("+39 333 1234567");
  await page.locator("#firstName").fill("Mario");
  await page.locator("#lastName").fill("Rossi");
  await page.locator("#address").fill("Via Roma 1");
  await page.locator("#city").fill("Milano");
  await page.locator("#postalCode").fill("20121");
  await page.locator("#province").fill("MI");
}

test.describe("storefront order intake", () => {
  test("shows the database price, not the bundled catalogue price", async ({ page }) => {
    await seedCart(page, 2);
    await page.goto("/checkout");

    // The fixture sells at 12,34; no product in src/data/catalog.ts costs that.
    await expect(page.getByTestId("cart-subtotal")).toHaveText("€24,68");
    await expect(page.getByTestId("cart-shipping")).toHaveText("€5,00");
    await expect(page.getByTestId("cart-total")).toHaveText("€29,68");
    await expect(page.getByTestId("shipping-options")).toContainText("Corriere test");
  });

  test("a guest places a real order and the cart empties only then", async ({ page }) => {
    const email = `guest-${run}-${Date.now()}@example.com`;
    await seedCart(page, 2);
    await page.goto("/checkout");
    await fillContact(page, email);

    await expect(page.getByTestId("place-order")).toBeEnabled();
    await page.getByTestId("place-order").click();

    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    const orderNumber = await page.getByTestId("order-number").innerText();
    expect(orderNumber).toMatch(/^GD-\d{8}$/);

    // The order exists, belongs to nobody, and reserved its units.
    const row = sql(
      `select order_number || '|' || coalesce(customer_id::text, 'guest') || '|' || total_cents
       from public.orders where email = '${email}'`,
    );
    expect(row).toBe(`${orderNumber}|guest|2968`);

    const remaining = sql(`select stock_quantity from public.products where slug = '${slug}'`);
    expect(Number(remaining)).toBe(3);

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });

  test("never claims an email was sent or a payment was taken", async ({ page }) => {
    const email = `guest-${run}-${Date.now()}@example.com`;
    await seedCart(page, 1);
    await page.goto("/checkout");
    await fillContact(page, email);
    await page.getByTestId("place-order").click();

    const confirmation = page.getByTestId("order-confirmation");
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("Nessun pagamento è stato addebitato");
    await expect(confirmation).not.toContainText("email di conferma");
  });

  test("a closed shop refuses the order and keeps the cart", async ({ page }) => {
    sql("update public.site_settings set accept_orders = false where singleton");
    try {
      await seedCart(page, 1);
      await page.goto("/checkout");
      await fillContact(page, `closed-${run}@example.com`);

      await expect(page.getByTestId("checkout-notice")).toContainText("Gli ordini non sono al momento attivi");
      await expect(page.getByTestId("place-order")).toBeDisabled();
      await expect(page.getByTestId("order-confirmation")).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId("cart-count")).toHaveText("1");

      const orders = sql(`select count(*) from public.orders where email = 'closed-${run}@example.com'`);
      expect(Number(orders)).toBe(0);
    } finally {
      sql("update public.site_settings set accept_orders = true where singleton");
    }
  });

  test("a line beyond available stock is named and blocks the order", async ({ page }) => {
    await seedCart(page, 10);
    await page.goto("/checkout");

    await expect(page.getByTestId("checkout-notice")).toContainText("Alcuni articoli non sono ordinabili");
    await expect(page.getByTestId("place-order")).toBeDisabled();

    await page.goto("/carrello");
    await expect(page.getByTestId("cart-line-issue")).toContainText("Disponibilità insufficiente");
  });
});
