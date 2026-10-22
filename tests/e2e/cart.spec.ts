import { expect, test, type Page } from "@playwright/test";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE, SHIPPING_METHODS } from "../../src/data/catalog";

/**
 * Every cart below is built from Cobalt Dragoon, so its price and the shipping rate are read off
 * the catalogue rather than typed: the owner changes prices weekly, and a number spelled out here
 * turns every change into a red build.
 */
const DRAGOON = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!.price.amount;
const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
/** The smallest cart that still pays for shipping, and the smallest that clears the threshold. */
const FREE_FROM = Math.ceil(FREE_SHIPPING_THRESHOLD / DRAGOON);

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
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("adding the same product twice increments one line instead of duplicating it", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await buyPanel(page).getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("qty-input")).toHaveValue("2");
    await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * 2));
  });

  test("quantity drives the line total and the cart total", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * 2));
    await expect(page.getByTestId("cart-subtotal")).toHaveText(euro(DRAGOON * 2));
  });

  test("shipping is charged below the free-shipping threshold and free at or above it", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    // 1 x 25,50 -> below the threshold. Since 2026-10-23 the InPost Locker is the only method for a
    // small parcel, so the cart's price is final: no "da", no note about choosing at checkout.
    await expect(page.getByTestId("cart-shipping")).toHaveText(euro(SHIPPING_FLAT_RATE));
    await expect(page.getByTestId("cart-carrier-note")).toHaveCount(0);
    await expect(page.getByTestId("cart-total")).toHaveText(euro(DRAGOON + SHIPPING_FLAT_RATE));

    // Enough packs to clear the free-shipping threshold, whatever the two numbers are today.
    // Each click waits for the line to settle: on a phone a tap fired mid-render was being lost.
    for (let click = 1; click < FREE_FROM; click += 1) {
      await page.getByTestId("qty-increase").click();
      await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * (click + 1)));
    }
    await expect(page.getByTestId("cart-shipping")).toHaveText("Gratis");
    await expect(page.getByTestId("cart-carrier-note")).toHaveCount(0);
    await expect(page.getByTestId("cart-total")).toHaveText(euro(DRAGOON * FREE_FROM));
  });

  test("removing the last line shows the empty state", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
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

/**
 * The public gate runs against the mock provider, which has no order backend. These
 * tests pin the honest behaviour: the checkout refuses and never fabricates an order.
 * The real guest and authenticated flows live in tests/e2e/storefront, against the
 * ephemeral Supabase stack.
 */
test.describe("checkout", () => {
  const fillValidContact = async (page: Page) => {
    await page.locator("#email").fill("mario.rossi@email.it");
    await page.locator("#phone").fill("+39 333 1234567");
    await page.locator("#firstName").fill("Mario");
    await page.locator("#lastName").fill("Rossi");
    await page.locator("#address").fill("Via Roma 1");
    await page.locator("#city").fill("Milano");
    await page.locator("#postalCode").fill("20121");
    // Province is now a <select>; select by value (sigla).
    await page.locator("#province").selectOption("MI");
  };

  test("reports field errors on blur", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.locator("#email").fill("mario@");
    await page.locator("#email").blur();
    await expect(page.getByText("Inserisci un indirizzo email valido.")).toBeVisible();
  });

  test("rejects a malformed CAP", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.locator("#postalCode").fill("123");
    await page.locator("#postalCode").blur();
    await expect(page.getByText("Il CAP deve essere di 5 cifre.")).toBeVisible();
  });

  test("never confirms an order when no order backend is configured", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");
    await fillValidContact(page);

    await expect(page.getByTestId("checkout-notice")).toContainText("Gli ordini non sono ancora attivi");
    await expect(page.getByTestId("place-order")).toBeDisabled();
    await expect(page.getByTestId("order-confirmation")).toHaveCount(0);

    // Above all: the cart survives. Nothing was ordered, so nothing is cleared.
    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("promises no email and no payment it cannot deliver", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await expect(page.getByTestId("payment-notice")).toContainText("Nessun pagamento online è attivo");
    for (const absent of ["Carta di credito", "PayPal", "Klarna", "email di conferma"]) {
      await expect(page.getByText(absent, { exact: false })).toHaveCount(0);
    }
  });

  test("ships a small parcel to the InPost Locker the buyer picks from InPost's list", async ({ page }) => {
    // The Location API needs the shop's InPost keys, which CI does not have: its answer is stubbed.
    await page.route("**/api/inpost/lockers**", (route) =>
      route.fulfill({
        json: {
          lockers: [
            {
              id: "IT_ITROM44128M",
              code: "ITROM44128M",
              street: "piazza dei Cinquecento 48",
              postalCode: "00185",
              city: "Roma",
              province: "RM",
              place: "ATAC - Metro A e B -Termini",
              distance: 893,
              openAllDay: false,
            },
          ],
        },
      }),
    );
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    // InPost only since 2026-10-23: one method, the Locker, at its price.
    const shipping = page.getByTestId("shipping-options");
    await expect(shipping.getByRole("radio")).toHaveCount(SHIPPING_METHODS.length);
    await expect(shipping).toContainText("InPost · Locker");
    await expect(shipping).not.toContainText("Poste Italiane");
    await expect(page.getByTestId("cart-total")).toHaveText(euro(DRAGOON + SHIPPING_FLAT_RATE));
    await expect(page.getByTestId("cart-shipping")).toHaveText(euro(SHIPPING_FLAT_RATE));
    await expect(page.getByTestId("cart-carrier-note")).toHaveCount(0);

    // No Locker yet: the order cannot go. (Without payments the button is disabled, so the form is
    // submitted directly: the field rule is what is under test.)
    await page.getByTestId("checkout-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByText("Indica il Locker o il punto dove ritirare il pacco.")).toBeVisible();

    // The buyer searches by CAP and picks one; the order carries InPost's id for the label.
    await page.getByLabel("CAP o città del Locker").fill("00185");
    await page.getByLabel("CAP o città del Locker").press("Enter");
    await page.getByRole("button", { name: /piazza dei Cinquecento 48, Roma/ }).click();
    await expect(page.getByTestId("checkout-locker-picked")).toContainText("ITROM44128M · piazza dei Cinquecento 48, 00185 Roma");
    await expect(page.locator("input[name=pickupPointId]")).toHaveValue("IT_ITROM44128M");
    await expect(page.getByText("Indica il Locker o il punto dove ritirare il pacco.")).toHaveCount(0);
  });

  test("sends a stadium box to the door with Poste, since no Locker takes it", async ({ page }) => {
    await page.goto("/prodotto/drop-attack-battle-set");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await expect(page.getByTestId("shipping-locked")).toContainText("Poste Italiane · consegna a casa");
    await expect(page.getByTestId("bulky-cart-note")).toBeVisible();
    await expect(page.getByTestId("checkout-locker-picker")).toHaveCount(0);
    await expect(page.getByTestId("cart-shipping")).toHaveText(euro(665));
  });

  test("falls back to typing the Locker when InPost's search does not answer", async ({ page }) => {
    await page.route("**/api/inpost/lockers**", (route) => route.fulfill({ status: 503, json: { lockers: [], error: "non disponibile" } }));
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/checkout");

    await page.getByLabel("CAP o città del Locker").fill("00185");
    await page.getByRole("button", { name: "Cerca" }).click();
    await expect(page.getByRole("link", { name: "Trova il Locker sulla mappa InPost" })).toHaveAttribute("href", "https://inpost.it/trova-un-locker");
    await page.locator("#checkout-locker-manual").fill("ITROM44128M Termini");
    await page.locator("#checkout-locker-manual").blur();
    await expect(page.getByTestId("checkout-locker-picked")).toContainText("ITROM44128M Termini");
  });

  test("checkout with an empty cart offers nothing to pay for", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("checkout-form")).toHaveCount(0);
  });
});

/**
 * Express checkout ("Paga subito") on the public gate. The gate runs on the mock provider with
 * no order backend and no Stripe key, so the quote is not orderable: the express button must not
 * be offered at all (it would only lead to a refusal), while the cart keeps its normal path. The
 * button's own logic (orderable carts, Poste home only, locked Takara/mixed plans, the Stripe
 * session it opens) is covered by tests/unit/checkout-stripe-actions.test.ts and
 * tests/unit/stripe-checkout.test.ts.
 */
test.describe("express checkout button", () => {
  test("is not offered while orders are not active", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("express-checkout")).toHaveCount(0);
    await expect(page.getByTestId("express-checkout-error")).toHaveCount(0);
  });
});
