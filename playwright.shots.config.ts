import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The visual capture pass. It lives in its own config because playwright.config.ts
 * deliberately ignores screenshots.spec.ts — the capture writes files into
 * docs/screenshots and must never run as part of the assertion suite (or in CI).
 *
 * Project names are inherited from the base config on purpose: the spec writes to
 * docs/screenshots/<project name>, so "desktop" and "mobile" are the committed folders.
 */
export default defineConfig({
  ...base,
  testMatch: ["**/screenshots.spec.ts"],
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
});
