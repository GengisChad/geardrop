import { expect, test } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { login } from "./support";

/**
 * Listino e margini (owner, 2026-11-17): the owner loads the cost of a product already on the
 * shelf and reads, on the same page, what the piece earns. Editors never reach it.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

test("the owner loads a cost and the price list shows the margin", async ({ page }) => {
  const slug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!slug) throw new Error("Missing the Gear Drop product fixture");
  const sku = sql(`select sku from public.products where slug = '${slug}'`);

  await login(page, "OWNER");
  await page.goto("/admin/listino");
  await expect(page.getByRole("heading", { level: 1, name: "Listino e margini" })).toBeVisible();
  const row = page.getByTestId(`price-row-${sku}`);
  await expect(row).toBeVisible();

  const importer = page.getByTestId("cost-import");
  await importer.getByLabel("SKU;costo").fill(`${sku};6,50`);
  await importer.getByRole("button", { name: "Salva costi" }).click();
  await expect(importer.getByRole("status")).toContainText("1 costi salvati");

  // The row now carries a cost, whatever other goods-in did to its average, and so a margin.
  await page.goto("/admin/listino");
  await expect(row.getByTestId("list-cost-missing")).toHaveCount(0);
  await expect(row.locator("td").nth(2)).toHaveText(/^€\d/);
  await expect(row.locator("td").nth(5)).toHaveText(/^−?€\d/);
  await expect(page.getByTestId("list-potential-gross")).toHaveText(/^€\d/);

  await page.context().clearCookies();
  await login(page, "EDITOR");
  await page.goto("/admin/listino");
  await expect(page).toHaveURL(/\/admin$/);
});
