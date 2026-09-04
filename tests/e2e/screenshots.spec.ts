import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Visual capture pass. Not assertions — this writes full-page shots to docs/screenshots
 * so the build can be compared against the mockups by eye. Run with `pnpm shots`.
 */

const SHOTS: readonly { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "catalogo", path: "/negozio" },
  { name: "categoria-beyblade-x", path: "/negozio/beyblade-x" },
  { name: "categoria-vuota", path: "/negozio/lanciatori" },
  { name: "pdp-stadio", path: "/prodotto/drop-attack-battle-set" },
  { name: "pdp-cobalt", path: "/prodotto/cobalt-dragoon-2-60c" },
  { name: "pdp-phoenix", path: "/prodotto/soar-phoenix-9-60gf" },
  { name: "ricerca", path: "/ricerca?q=cobalt" },
  { name: "chi-siamo", path: "/chi-siamo" },
  { name: "404", path: "/pagina-inesistente" },
];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);

  // A full-page shot needs the below-the-fold images too, and next/image lazy-loads
  // them. Scroll the whole page to trigger loading, then return to the top.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });

  // Bounded: an image that never resolves must not hang the capture.
  await page.evaluate(async () => {
    const pending = Array.from(document.images)
      .filter((img) => !img.complete)
      .map((img) => new Promise((resolve) => img.addEventListener("load", resolve, { once: true })));
    await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, 3000))]);
  });

  await page.waitForTimeout(400);
}

test.describe("screenshots", () => {
  for (const shot of SHOTS) {
    test(`capture ${shot.name}`, async ({ page }, testInfo) => {
      const dir = `docs/screenshots/${testInfo.project.name}`;
      await mkdir(dir, { recursive: true });
      await page.goto(shot.path);
      await settle(page);
      await page.screenshot({ path: `${dir}/${shot.name}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("capture carrello-pieno", async ({ page }, testInfo) => {
    const dir = `docs/screenshots/${testInfo.project.name}`;
    await mkdir(dir, { recursive: true });

    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await page.locator("#buy-panel").getByTestId("add-to-cart").click();
    await page.goto("/prodotto/soar-phoenix-9-60gf");
    await page.locator("#buy-panel").getByTestId("add-to-cart").click();

    await page.goto("/carrello");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    await settle(page);
    await page.screenshot({ path: `${dir}/carrello.png`, fullPage: true, animations: "disabled" });

    await page.goto("/checkout");
    await settle(page);
    await page.screenshot({ path: `${dir}/checkout.png`, fullPage: true, animations: "disabled" });
  });
});
