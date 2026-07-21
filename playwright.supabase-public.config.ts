import { defineConfig, devices } from "@playwright/test";

/**
 * Public storefront gate against the real Supabase stack.
 *
 * playwright.config.ts exercises the same pages on the mock provider, which is offline
 * and deterministic but cannot see a privilege or RLS mistake. That blind spot is not
 * hypothetical: the anonymous catalogue query embedded a staff-only table and every
 * product page died with `42501 permission denied for table media_assets`, all the way
 * through a green CI and into the first Vercel build.
 *
 * So this config runs the storefront exactly as an anonymous visitor gets it —
 * COMMERCE_PROVIDER and CONTENT_PROVIDER both on supabase, reading the ephemeral CI
 * database with the local anon key. It does not replace the mock gate; both run.
 *
 * The secret key is deliberately absent from the web server environment: nothing the
 * anonymous storefront renders may depend on it, and leaving it out means a regression
 * that reaches for elevated access fails here instead of passing quietly.
 */
export default defineConfig({
  testDir: "./tests/e2e/supabase-public",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/supabase-public" }]]
    : "line",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/negozio",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      COMMERCE_PROVIDER: "supabase",
      CONTENT_PROVIDER: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  },
  projects: [
    { name: "supabase-public-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
