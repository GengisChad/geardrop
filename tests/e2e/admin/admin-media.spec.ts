import { expect, test } from "@playwright/test";
import { login } from "./support";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("multi-upload isolates an invalid SVG and preserves the ready preview", async ({ page }) => {
  await login(page);
  await page.goto("/admin/media");
  await page.locator('input[type="file"]').setInputFiles([
    { name: "valid.png", mimeType: "image/png", buffer: png },
    { name: "invalid.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>') },
  ]);
  await page.getByLabel("Alt text valid.png").fill("Pixel valido");
  await page.getByLabel("Alt text invalid.svg").fill("SVG non valido");
  await page.getByRole("button", { name: "Carica batch" }).click();
  await expect(page.getByText("ready", { exact: true })).toBeVisible();
  await expect(page.getByText("failed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "valid.png" }).first()).toBeVisible();
  await expect(page.getByText("Pixel valido").first()).toBeVisible();
});
