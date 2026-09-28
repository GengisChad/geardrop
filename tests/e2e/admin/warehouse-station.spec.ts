import { expect, test } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { login, uniqueSlug } from "./support";

/**
 * A paid order arrives at the warehouse station, is taken into work, and prints with its pick
 * list and its 100 × 150 mm label; shipping it with the courier cost feeds the order's profit.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

test("a paid order goes from the station to a printed label and a costed shipment", async ({ page }, testInfo) => {
  const productSlug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!productSlug) throw new Error("Missing the Gear Drop product fixture");
  const orderNumber = `GD-${uniqueSlug(testInfo, "station").toUpperCase()}`;
  const address = JSON.stringify({ name: "Mario Rossi", address: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT", phone: "+39 333 0000000" });
  const orderId = sql(`
    with created as (
      insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents, shipping_cents,
        total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
      values ((select id from public.organizations where slug = 'geardrop'), '${orderNumber}', 'buyer@example.com', 'confirmed',
        'paid', 3000, 0, 3000, 'standard', '${address}', '{}', gen_random_uuid())
      returning id
    ), line as (
      insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_cents,
        line_total_cents, image_src_snapshot)
      select created.id, product.id, product.name, product.sku, 2, 1500, 3000, '/products/wizard-arrow-4-80b-1.webp'
      from created, public.products as product where product.slug = '${productSlug}'
      returning order_id
    )
    select order_id from line`);
  expect(orderId).toMatch(/^\d+$/);

  await login(page, "OWNER");
  await page.goto("/admin/magazzino");
  const card = page.getByTestId("station-order").filter({ hasText: orderNumber });
  await expect(card).toContainText("Mario Rossi");
  await expect(card).toContainText("×2");
  await card.getByRole("button", { name: "Prendi in carico" }).click();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: /In lavorazione/ }) })
    .getByTestId("station-order").filter({ hasText: orderNumber })).toBeVisible();
  expect(sql(`select status from public.orders where id = ${orderId}`)).toBe("processing");

  await page.goto(`/admin/magazzino/stampa?ordini=${orderId}`);
  const label = page.getByTestId("shipping-label");
  await expect(label).toHaveCount(1);
  await expect(label).toContainText("Mario Rossi");
  await expect(label).toContainText("20121 Milano (MI)");
  await expect(label).toContainText(orderNumber);
  await expect(page.getByRole("table")).toContainText(productSlug);

  await page.goto(`/admin/ordini/${orderId}`);
  await page.getByLabel("Codice di tracciamento").fill("018207900244");
  await page.getByLabel("Costo corriere per noi (€, facoltativo)").fill("4,00");
  await page.getByLabel("Invia l’email al cliente").uncheck();
  await page.getByRole("button", { name: "Spedisci" }).click();
  await expect(page.getByText("Ordine segnato come spedito. Nessuna email inviata.")).toBeVisible();
  expect(sql(`select status || ':' || shipping_cost_cents from public.orders where id = ${orderId}`)).toBe("shipped:400");
});
