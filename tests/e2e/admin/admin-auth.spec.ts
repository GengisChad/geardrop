import { expect, test } from "@playwright/test";
import { login } from "./support";

test("anonymous redirect, generic error, no signup, staff login and logout", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("link", { name: /registr/i })).toHaveCount(0);
  await page.getByLabel("Email staff").fill("invalid@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Accedi alla console" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Credenziali non valide o accesso staff non autorizzato");
  await login(page);
  await page.getByRole("button", { name: /Esci dall/ }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("customer identity is denied with the same safe message", async ({ page }) => {
  const email = process.env.ADMIN_E2E_CUSTOMER_EMAIL;
  const password = process.env.ADMIN_E2E_PASSWORD;
  if (!email || !password) throw new Error("Missing local customer fixture");
  await page.goto("/admin/login");
  await page.getByLabel("Email staff").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi alla console" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Credenziali non valide o accesso staff non autorizzato");
});
