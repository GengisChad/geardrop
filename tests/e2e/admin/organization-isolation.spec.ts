import { expect, test, type Page } from "@playwright/test";
import { localPsql } from "../support/local-psql";
import { createProduct, login, uniqueSlug } from "./support";

/**
 * Two companies in one admin: every list shows the company in view and nothing else, a
 * record of the other company is not found, and nothing of a company without a public shop
 * reaches the storefront's anonymous API.
 */

function sql(query: string): string {
  return localPsql(["--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", query], { encoding: "utf8" }).trim();
}

/** The number a list page prints in its heading, e.g. "21 risultati · …". */
async function listedTotal(page: Page, route: string, label: RegExp): Promise<number> {
  const response = await page.goto(route);
  expect(response?.status(), route).toBeLessThan(400);
  const heading = page.getByText(label).first();
  await expect(heading).toBeVisible();
  return Number.parseInt((await heading.textContent()) ?? "", 10);
}

const PRODUCTS = /^\d+ risultati ·/;
const CATEGORIES = /^\d+ righe reali · ordine/;
const INVENTORY = /^\d+ prodotti reali ·/;
const ORDERS = /^\d+ ordini reali ·/;

async function switchTo(page: Page, name: "Gear Drop" | "Oryvenne", slug: "geardrop" | "oryvenne"): Promise<void> {
  await page.goto("/admin");
  await page.getByTestId("organization-switcher").selectOption(slug);
  // The server answers with the other company's overview: its name is on the brand link.
  await expect(page.getByRole("link", { name: `${name} — panoramica del gestionale` })).toBeVisible();
}

test("the company in view is always on screen", async ({ page }) => {
  await login(page, "OWNER");
  await expect(page.getByTestId("organization-switcher")).toBeVisible();
  await page.context().clearCookies();
  await login(page, "ADMIN");
  // One company: its name, no menu.
  await expect(page.getByTestId("organization-current")).toContainText("Gear Drop");
  await expect(page.getByTestId("organization-switcher")).toHaveCount(0);
});

test("switching company changes every list and never mixes rows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "admin-1440", "the isolation lives in the data: one viewport proves it");
  await login(page, "OWNER");
  await switchTo(page, "Gear Drop", "geardrop");
  expect(await listedTotal(page, "/admin/prodotti", PRODUCTS)).toBeGreaterThan(0);

  await switchTo(page, "Oryvenne", "oryvenne");
  const oryvenneProducts = await listedTotal(page, "/admin/prodotti", PRODUCTS);
  expect(await listedTotal(page, "/admin/ordini", ORDERS)).toBe(0);
  expect(await listedTotal(page, "/admin/inventario", INVENTORY)).toBe(oryvenneProducts);
  const oryvenneCategories = await listedTotal(page, "/admin/categorie", CATEGORIES);

  // Oryvenne starts its own catalogue from the same screens.
  const categorySlug = uniqueSlug(testInfo, "oryvenne-categoria");
  await page.goto("/admin/categorie/nuova");
  await page.locator('input[name="name"]').fill(`Categoria ${categorySlug}`);
  await page.locator('input[name="slug"]').fill(categorySlug);
  await page.locator('input[name="tagline"]').fill("Categoria creata nel gestionale Oryvenne");
  await page.locator('textarea[name="description"]').fill("Prima categoria dell'azienda senza negozio online.");
  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect(page).toHaveURL(/\/admin\/categorie\/\d+/);
  expect(await listedTotal(page, "/admin/categorie", CATEGORIES)).toBe(oryvenneCategories + 1);

  const productSlug = await createProduct(page, testInfo, "draft", "oryvenne");
  const productId = /\/admin\/prodotti\/(\d+)/.exec(page.url())?.[1];
  expect(productId).toBeTruthy();
  expect(sql(`select o.slug from public.products p join public.organizations o on o.id = p.organization_id where p.slug = '${productSlug}'`)).toBe("oryvenne");
  expect(await listedTotal(page, "/admin/prodotti", PRODUCTS)).toBe(oryvenneProducts + 1);

  // Back in Gear Drop the Oryvenne product does not exist, not even by its address.
  await switchTo(page, "Gear Drop", "geardrop");
  expect(await listedTotal(page, `/admin/prodotti?q=${productSlug}`, PRODUCTS)).toBe(0);
  const crossed = await page.goto(`/admin/prodotti/${productId}`);
  expect(crossed?.status()).toBe(404);

  // Oryvenne has no public shop: the anonymous API returns nothing of it.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing local Supabase public configuration");
  const anonymous = await page.request.get(`${url}/rest/v1/products?select=id&slug=eq.${productSlug}`, { headers: { apikey: key } });
  expect(anonymous.ok()).toBe(true);
  expect(await anonymous.json()).toEqual([]);
});

test("an owner of Oryvenne alone never reaches Gear Drop", async ({ page }) => {
  await login(page, "ORYVENNE_OWNER");
  await expect(page.getByTestId("organization-current")).toContainText("Oryvenne");
  await expect(page.getByTestId("organization-switcher")).toHaveCount(0);
  // No public shop to link to.
  await expect(page.getByRole("link", { name: "Visualizza negozio" })).toHaveCount(0);

  const slug = process.env.ADMIN_E2E_GEARDROP_PRODUCT;
  if (!slug) throw new Error("Missing the Gear Drop product fixture");
  const id = sql(`select p.id from public.products p join public.organizations o on o.id = p.organization_id where o.slug = 'geardrop' and p.slug = '${slug}'`);
  expect(id).toMatch(/^\d+$/);
  expect(await listedTotal(page, `/admin/prodotti?q=${slug}`, PRODUCTS)).toBe(0);
  const crossed = await page.goto(`/admin/prodotti/${id}`);
  expect(crossed?.status()).toBe(404);
  expect(await listedTotal(page, "/admin/ordini", ORDERS)).toBe(0);
});
