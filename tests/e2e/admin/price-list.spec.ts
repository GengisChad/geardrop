import { expect, test } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { login } from "./support";

/**
 * Listino e margini (owner, 2026-11-17): the owner types the cost of a product into its row and
 * reads, on the same page, what the piece earns. Editors never reach it.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

test("the owner types a cost into the price list and the row shows its margin", async ({ page }) => {
  const slug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!slug) throw new Error("Missing the Gear Drop product fixture");
  const sku = sql(`select sku from public.products where slug = '${slug}'`);

  await login(page, "OWNER");
  await page.goto("/admin/listino");
  await expect(page.getByRole("heading", { level: 1, name: "Listino e margini" })).toBeVisible();
  const row = page.getByTestId(`price-row-${sku}`);
  await expect(row).toBeVisible();

  // The fixture sells at 15,00: 12,30 net of 22% VAT. A piece that costs 6,50 leaves 5,80.
  const cost = row.getByTestId(`list-cost-form-${sku}`);
  await cost.getByRole("textbox").fill("6,50");
  await cost.getByRole("button", { name: "Salva" }).click();
  await expect(cost.getByRole("status")).toContainText("Costo salvato");
  await expect(row.getByTestId("list-cost-missing")).toHaveCount(0);
  await expect(cost.getByRole("textbox")).toHaveValue("6,50");
  await expect(row.locator("td").nth(5)).toHaveText("€5,80");
  expect(sql(`select average_cost_cents from public.inventory_cost_state where product_id = (select id from public.products where slug = '${slug}')`)).toBe("650");

  // The same box corrects it later.
  await cost.getByRole("textbox").fill("7,00");
  await cost.getByRole("button", { name: "Salva" }).click();
  await expect(row.locator("td").nth(5)).toHaveText("€5,30");

  // The opening-cost box under the table takes many products at once.
  const importer = page.getByTestId("cost-import");
  await importer.getByLabel("SKU;costo").fill(`${sku};6,50`);
  await importer.getByRole("button", { name: "Salva costi" }).click();
  await expect(importer.getByRole("status")).toContainText("1 costi salvati");

  await page.context().clearCookies();
  await login(page, "EDITOR");
  await page.goto("/admin/listino");
  await expect(page).toHaveURL(/\/admin$/);
});
