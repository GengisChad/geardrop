import { expect, test } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { login, uniqueSlug } from "./support";

/**
 * Warehouse at cost, through the screens: a supplier, a goods receipt with freight, its
 * confirmation, and the average cost it leaves on the product. Editors and other companies
 * never reach it.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

function fixtureProductId(): string {
  const slug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!slug) throw new Error("Missing the Gear Drop product fixture");
  return sql(`select id from public.products where slug = '${slug}'`);
}

test("a supplier invoice enters the warehouse at its landed cost", async ({ page }, testInfo) => {
  const supplierName = `Distribuidora ${uniqueSlug(testInfo, "e2e")}`;
  const documentNumber = uniqueSlug(testInfo, "fv").toUpperCase();
  const productId = fixtureProductId();

  await login(page, "OWNER");
  await page.goto("/admin/fornitori");
  const newSupplier = page.getByTestId("supplier-form-new");
  await newSupplier.getByLabel("Nome").fill(supplierName);
  await newSupplier.getByLabel("Partita IVA").fill("ESB12345678");
  await newSupplier.getByRole("button", { name: "Crea fornitore" }).click();
  await expect(newSupplier.getByRole("status")).toHaveText("Fornitore creato.");

  await page.goto("/admin/carichi/nuovo");
  const editor = page.getByTestId("receipt-editor");
  await editor.getByLabel("Fornitore").selectOption({ label: `${supplierName} · ES` });
  await editor.getByLabel("Numero documento").fill(documentNumber);
  await editor.getByLabel("Trasporto in entrata (€)").fill("7,00");
  await editor.getByLabel("Prodotto riga 1").selectOption(productId);
  await editor.getByLabel("Quantità riga 1").fill("10");
  await editor.getByLabel("Costo unitario riga 1").fill("6,50");
  // The editor shows the landed cost the database will apply: 6,50 + 7,00 / 10.
  await expect(editor.getByText("€7,20 / pz")).toBeVisible();
  await editor.getByRole("button", { name: "Salva bozza" }).click();
  await expect(page).toHaveURL(/\/admin\/carichi\/\d+\?creato=1/);
  const receiptId = /\/admin\/carichi\/(\d+)/.exec(page.url())?.[1];

  await page.getByLabel("Scrivi CARICA").fill("CARICA");
  await page.getByRole("button", { name: "Carica in magazzino" }).click();
  await expect(page).toHaveURL(/\?caricato=1/);
  await expect(page.getByTestId("receipt-value")).toHaveText("€72,00");

  await page.goto(`/admin/prodotti/${productId}`);
  await expect(page.getByTestId("average-cost")).toHaveText("€7,20");
  expect(sql(`select status from public.supplier_receipts where id = ${receiptId}`)).toBe("confirmed");

  // Editors do not see costs, and another company does not see the document.
  await page.context().clearCookies();
  await login(page, "EDITOR");
  await page.goto("/admin/carichi");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/prodotti/${productId}`);
  await expect(page.getByTestId("product-cost-panel")).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, "ORYVENNE_OWNER");
  const crossed = await page.goto(`/admin/carichi/${receiptId}`);
  expect(crossed?.status()).toBe(404);
});
