import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests/e2e",
  // The admin, storefront-order and public-Supabase gates need the live Supabase stack
  // and run from their own configs; this one exercises the storefront on the mock
  // provider. Both public gates are kept: mock catches UI regressions offline, the
  // Supabase one catches privilege and RLS regressions the mock cannot see.
  testIgnore: ["**/admin/**", "**/storefront/**", "**/supabase-public/**", "**/screenshots.spec.ts"],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Key omitted rather than set to undefined: exactOptionalPropertyTypes rejects that,
  // and omitting it lets Playwright pick its own default locally.
  workers: isCI ? 1 : 2,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  // The runner shares its two cores with the whole local Supabase stack — Postgres,
  // PostgREST, GoTrue, Kong and the rest stay up for the gates that need them, and this
  // one inherits the contention. A production server that reports "Ready in 129ms" and
  // then takes over a minute to answer a navigation is a starved machine, not a slow
  // page: the same routes serve in under 200ms locally. The budget is raised on CI only,
  // so a genuine regression still fails fast on a developer's machine.
  timeout: isCI ? 120_000 : 60_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    ...(isCI ? { navigationTimeout: 90_000, actionTimeout: 30_000 } : {}),
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  // Tests run against a production build: that is what ships, and it exercises the
  // prerendered routes rather than dev-mode behaviour.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: "pipe",
    // This gate exercises the mock provider, but CI exports the local Supabase URL and key
    // into the job environment for the gates that need them, and they reach this server
    // too. The live-stock overlay asks whether Supabase is configured rather than which
    // provider is selected, so the "mock" catalogue was quietly reading a database that an
    // earlier step had reset and the admin gates had since rewritten. Blanking the two
    // public variables makes this gate test what it says it tests, on CI and locally alike.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});
