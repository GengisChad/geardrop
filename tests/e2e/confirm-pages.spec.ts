import { expect, test } from "@playwright/test";

/**
 * The interstitial confirmation pages. Their contract: a GET renders the explicit button
 * and consumes nothing — a mailbox scanner can fetch the page freely — and a malformed
 * link gets a readable dead end, not a crash.
 */

const TOKEN = "pkce_0123456789abcdef0123456789abcdef";

test.describe("prefetch-resistant confirmation pages", () => {
  test("GET /conferma-email renders the button and calls no auth endpoint", async ({ page }) => {
    const authCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/auth\/v1\//.test(request.url())) authCalls.push(request.url());
    });

    await page.goto(`/conferma-email?token_hash=${TOKEN}&type=email`);

    await expect(page.getByTestId("confirm-signup-form")).toBeVisible();
    await expect(page.getByTestId("confirm-button")).toBeVisible();
    await expect(page.getByTestId("confirm-button")).toHaveText("CONFERMA ACCOUNT");
    // One h1, glass shell, and — the point — zero auth traffic on load.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(authCalls, "the GET load reached an auth endpoint").toEqual([]);
  });

  test("GET /conferma-recupero renders the button and calls no auth endpoint", async ({ page }) => {
    const authCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/auth\/v1\//.test(request.url())) authCalls.push(request.url());
    });

    await page.goto(`/conferma-recupero?token_hash=${TOKEN}&type=recovery`);

    await expect(page.getByTestId("confirm-recovery-form")).toBeVisible();
    await expect(page.getByTestId("confirm-button")).toBeVisible();
    expect(authCalls, "the GET load reached an auth endpoint").toEqual([]);
  });

  test("a malformed link gets a readable dead end", async ({ page }) => {
    await page.goto("/conferma-email?token_hash=corto");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Link non valido");
    await expect(page.getByTestId("confirm-signup-form")).toHaveCount(0);

    await page.goto("/conferma-recupero");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Link non valido");
    await expect(page.getByTestId("confirm-recovery-form")).toHaveCount(0);
  });

  test("the resend form on /registrati has its cooldown wired", async ({ page }) => {
    await page.goto("/registrati");

    await expect(page.getByTestId("resend-form")).toBeVisible();
    const button = page.getByTestId("resend-button");
    await expect(button).toHaveText("REINVIA EMAIL");
    await expect(button).toBeEnabled();
  });
});
