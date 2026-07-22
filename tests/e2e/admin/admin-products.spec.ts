import { expect, test } from "@playwright/test";
import { createProduct, login } from "./support";

test("empty list, draft creation, publication and atomic duplication", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/admin/prodotti");
  const slug = await createProduct(page, testInfo, "draft");
  await expect(page.locator('input[name="publicationStatus"]')).toHaveValue("draft");
  await page.getByRole("button", { name: "Pubblica" }).click();
  await expect(page.getByRole("link", { name: "Anteprima pubblica" })).toBeVisible();
  await page.getByRole("button", { name: "Duplica come bozza" }).click();
  await expect(page).toHaveURL(/duplicated=1/);
  await expect(page.locator('input[name="publicationStatus"]')).toHaveValue("draft");
  await expect(page.locator('input[name="slug"]')).not.toHaveValue(slug);
});

test("editor commerce and inventory controls stay read-only", async ({ page }, testInfo) => {
  await login(page, "EDITOR");
  await page.goto("/admin/prodotti/nuovo");
  await expect(page.locator('input[name="priceCents"]:disabled')).toBeVisible();
  await expect(page.getByText(/Prezzi, override e regole inventario richiedono/)).toBeVisible();
  await page.goto("/admin/inventario");
  await expect(page.getByRole("heading", { name: "Consultazione inventario" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registra movimento" })).toHaveCount(0);
  expect(testInfo.project.name).toMatch(/^admin-(390|768|1440)$/);
});
