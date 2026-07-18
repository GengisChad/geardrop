import { expect, test } from "@playwright/test";
import { createProduct, login } from "./support";

test("manager adjustment updates authoritative stock and movement history", async ({ page }, testInfo) => {
  await login(page, "ADMIN");
  const sku = await createProduct(page, testInfo, "draft", "inventario");
  await page.goto("/admin/inventario");
  await page.locator('input[name="sku"]').fill(sku);
  await page.locator('input[name="delta"]').fill("7");
  await page.locator('select[name="reason"]').selectOption("manual_adjustment");
  await page.locator('textarea[name="note"]').fill("Conteggio browser locale");
  await page.getByRole("button", { name: "Registra movimento" }).click();
  await expect(page.getByRole("status")).toContainText("Stock attuale: 7");
  await page.reload();
  await expect(page.getByRole("cell", { name: "7", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Conteggio browser locale").last()).toBeVisible();
});
