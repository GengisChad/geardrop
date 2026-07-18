import { expect, test } from "@playwright/test";
import { login } from "./support";

test("real-data states and navigation fit the approved viewport", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/admin");
  await expect(page.getByText("Prodotti totali")).toBeVisible();
  for (const route of [
    "/admin",
    "/admin/prodotti?q=nessun-risultato-browser",
    "/admin/media?q=nessun-risultato-browser",
    "/admin/inventario?q=nessun-risultato-browser",
  ]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} horizontal overflow in ${testInfo.project.name}`).toBeLessThanOrEqual(1);
  }
  const viewport = page.viewportSize();
  expect(viewport?.width).toBe(Number(testInfo.project.name.replace("admin-", "")));
  await page.goto("/admin/prodotti?q=nessun-risultato-browser");
  await expect(page.getByText("Nessun prodotto corrisponde ai filtri.")).toBeVisible();
  await page.goto("/admin/media?q=nessun-risultato-browser");
  await expect(page.getByRole("heading", { name: "Nessun media caricato" })).toBeVisible();
  await page.goto("/admin/inventario?q=nessun-risultato-browser");
  await expect(page.getByRole("heading", { name: "Nessun prodotto in inventario" })).toBeVisible();
});
