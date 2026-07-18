import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/admin",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/admin" }]] : "line",
  globalSetup: "./tests/e2e/admin/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/admin/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { COMMERCE_PROVIDER: "mock" },
  },
  projects: [
    { name: "admin-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "admin-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "admin-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
