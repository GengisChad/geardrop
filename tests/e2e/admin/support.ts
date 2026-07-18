import { expect, type Page, type TestInfo } from "@playwright/test";

type Staff = "OWNER" | "ADMIN" | "EDITOR";

export async function login(page: Page, role: Staff = "OWNER"): Promise<void> {
  const email = process.env[`ADMIN_E2E_${role}_EMAIL`];
  const password = process.env.ADMIN_E2E_PASSWORD;
  if (!email || !password) throw new Error("Missing local browser fixture credentials");
  await page.goto("/admin/login");
  await page.getByLabel("Email staff").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi alla console" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export function uniqueSlug(testInfo: TestInfo, stem: string): string {
  return `${stem}-${testInfo.project.name}-${process.env.ADMIN_E2E_RUN ?? "local"}`.replace(/[^a-z0-9-]/g, "-");
}

export async function createProduct(
  page: Page,
  testInfo: TestInfo,
  intent: "draft" | "publish" = "draft",
  stem = "prodotto",
) {
  const slug = uniqueSlug(testInfo, `${stem}-${intent}`);
  await page.goto("/admin/prodotti/nuovo");
  await page.locator('input[name="name"]').fill(`Prodotto ${slug}`);
  await page.locator('input[name="slug"]').fill(slug);
  await page.locator('input[name="sku"]').fill(slug);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await page.locator('input[name="tagline"]').fill("Tagline verificata dal browser");
  await page.locator('textarea[name="description"]').fill("Descrizione reale creata nello stack Supabase temporaneo.");
  await page.locator('input[name="priceCents"]').fill("1999");
  await page.getByRole("button", { name: intent === "publish" ? "Pubblica" : "Salva bozza" }).click();
  await expect(page).toHaveURL(/\/admin\/prodotti\/\d+/);
  return slug;
}
