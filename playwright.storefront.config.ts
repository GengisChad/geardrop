import { defineConfig, devices } from "@playwright/test";

/**
 * Storefront order gate: the real checkout against the ephemeral local Supabase stack.
 *
 * Separate from playwright.config.ts because that one runs the storefront on the mock
 * provider, where by design no order can be placed. Retries are off: the tests reserve
 * real stock, so a re-run would not start from the state the previous attempt assumed.
 */
export default defineConfig({
  testDir: "./tests/e2e/storefront",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/storefront" }]]
    : "line",
  globalSetup: "./tests/e2e/storefront/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/checkout",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      COMMERCE_PROVIDER: "supabase",
      CONTENT_PROVIDER: "mock",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
    },
  },
  projects: [{ name: "storefront-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
