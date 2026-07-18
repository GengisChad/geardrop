import { expect, test } from "@playwright/test";
import { login } from "./support";

const ownerRoutes = [
  "/admin", "/admin/prodotti", "/admin/categorie", "/admin/bundle", "/admin/media",
  "/admin/inventario", "/admin/homepage", "/admin/homepage/anteprima", "/admin/pagine",
  "/admin/navigazione", "/admin/footer", "/admin/promozioni", "/admin/coupon",
  "/admin/ordini", "/admin/spedizioni", "/admin/impostazioni",
  "/admin/impostazioni/negozio", "/admin/impostazioni/seo",
  "/admin/impostazioni/contatti", "/admin/impostazioni/social", "/admin/team", "/admin/attivita",
] as const;

test("every Full Admin module renders real state without horizontal overflow", async ({ page }, testInfo) => {
  await login(page, "OWNER");
  for (const route of ownerRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} status`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} overflow in ${testInfo.project.name}`).toBeLessThanOrEqual(1);
  }
});

test("role boundaries keep editor and admin away from owner-only modules", async ({ page }) => {
  await login(page, "EDITOR");
  for (const route of ["/admin/ordini", "/admin/promozioni", "/admin/coupon", "/admin/spedizioni", "/admin/impostazioni", "/admin/team", "/admin/attivita"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/admin$/);
  }

  await page.context().clearCookies();
  await login(page, "ADMIN");
  await page.goto("/admin/impostazioni");
  await expect(page.getByRole("heading", { name: "Impostazioni" })).toBeVisible();
  await page.goto("/admin/team");
  await expect(page).toHaveURL(/\/admin$/);
});

test("owner settings mutation persists validated real data", async ({ page }, testInfo) => {
  await login(page, "OWNER");
  await page.goto("/admin/impostazioni/seo");
  const title = `SEO ${testInfo.project.name}`;
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="description"]').fill("Descrizione verificata nel database temporaneo.");
  await page.getByRole("button", { name: "Salva SEO" }).click();
  await expect(page.getByRole("status")).toContainText("salvat", { ignoreCase: true });
  await page.reload();
  await expect(page.locator('input[name="title"]')).toHaveValue(title);
});
