import { expect, test } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { login, uniqueSlug } from "./support";

/**
 * "Codici ed etichette": the owner saves the barcode of a box, then the parcel check counts that
 * box by its barcode, refuses a piece that is not in the order, and writes the check on the order.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

/** A valid EAN-13 that no other test uses: twelve digits from the test name, then the check digit. */
function uniqueEan(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_000;
  const body = `200${String(hash).padStart(9, "0")}`;
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

test("a saved box barcode counts the piece in the parcel check", async ({ page }, testInfo) => {
  const productSlug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!productSlug) throw new Error("Missing the Gear Drop product fixture");
  // A retry gets its own order: the first attempt may already have created one with this number.
  const slug = `${uniqueSlug(testInfo, "pack")}-r${testInfo.retry}`;
  const orderNumber = `GD-${slug.toUpperCase()}`;
  const ean = uniqueEan(slug);
  const sku = sql(`select sku from public.products where slug = '${productSlug}'`);
  const address = JSON.stringify({ name: "Mario Rossi", address: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT" });
  const orderId = sql(`
    with created as (
      insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents, shipping_cents,
        total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
      values ((select id from public.organizations where slug = 'geardrop'), '${orderNumber}', 'buyer@example.com', 'confirmed',
        'paid', 1500, 0, 1500, 'standard', '${address}', '{}', gen_random_uuid())
      returning id
    ), line as (
      insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_cents,
        line_total_cents, image_src_snapshot)
      select created.id, product.id, product.name, product.sku, 1, 1500, 1500, '/products/wizard-arrow-4-80b-1.webp'
      from created, public.products as product where product.slug = '${productSlug}'
      returning order_id
    )
    select order_id from line`);
  expect(orderId).toMatch(/^\d+$/);

  try {
    await login(page, "OWNER");
    await page.goto(`/admin/inventario/codici?q=${encodeURIComponent(sku)}`);
    const row = page.getByTestId("code-row").filter({ hasText: sku });
    await row.getByPlaceholder("EAN della scatola").fill(ean);
    await row.getByRole("button", { name: "Salva" }).click();
    await expect(row).toContainText(`Salvato: ${ean}.`);

    await page.goto(`/admin/magazzino/controllo/${orderId}`);
    const code = page.getByLabel("Codice del pezzo");
    await code.fill("4006381333931");
    await code.press("Enter");
    await expect(page.getByText(/non è nell'ordine/)).toBeVisible();

    await code.fill(ean);
    await code.press("Enter");
    await expect(page.getByText("Pacco completo: tutti i pezzi giusti.")).toBeVisible();
    await expect(page.getByTestId("pack-line")).toContainText("1/1");

    await page.getByRole("button", { name: `Registra il controllo su ${orderNumber}` }).click();
    await expect(page.getByText("Controllo registrato sull'ordine.")).toBeVisible();
    expect(sql(`select count(*) from public.order_notes where order_id = ${orderId} and note like 'Pacco controllato con scansione%'`)).toBe("1");
  } finally {
    sql(`update public.products set gtin = null where slug = '${productSlug}'`);
  }
});
