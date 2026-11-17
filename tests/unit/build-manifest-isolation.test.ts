import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

async function verifier() {
  expect(existsSync(resolve("scripts/verify-build-manifest-isolation.ts"))).toBe(true);
  return import("../../scripts/verify-build-manifest-isolation");
}
function build(root: string, paths: string[]) {
  mkdirSync(join(root, "server"), { recursive: true });
  writeFileSync(join(root, "BUILD_ID"), "same-id-is-valid");
  writeFileSync(join(root, "routes-manifest.json"), JSON.stringify({ staticRoutes: paths.map(page => ({ page })), dynamicRoutes: [], rewrites: [] }));
  writeFileSync(join(root, "server/app-paths-manifest.json"), JSON.stringify(Object.fromEntries(paths.map(p => [`${p === "/" ? "" : p}/page`, "app.js"]))));
  writeFileSync(join(root, "server/pages-manifest.json"), "{}");
  writeFileSync(join(root, "prerender-manifest.json"), '{"routes":{},"dynamicRoutes":{}}');
  writeFileSync(join(root, "app-path-routes-manifest.json"), "{}");
}
describe("real build directories and route ownership", () => {
  it.each(["/logout", "/settings/security", "/mfa/enroll", "/mfa/challenge"])
  ("rejects management-only route %s in storefront before the child implements it", async route => {
    const { verifyBuildManifestIsolation } = await verifier();
    const root = mkdtempSync(join(tmpdir(), "gd-manifest-"));
    try {
      const store = join(root, ".next"); const management = join(root, "apps/management/.next");
      build(store, ["/", "/admin", "/api/stripe/webhook", "/robots.txt", route]);
      build(management, ["/", "/robots.txt"]);
      expect(() => verifyBuildManifestIsolation(store, management)).toThrow(`GD_ROUTE_OWNERSHIP_COLLISION: ${route}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("requires distinct canonical directories and build IDs, but not different ID values", async () => {
    const { verifyBuildManifestIsolation } = await verifier();
    const root = mkdtempSync(join(tmpdir(), "gd-manifest-"));
    try {
      const store = join(root, ".next"); const management = join(root, "apps/management/.next");
      build(store, ["/", "/login", "/admin", "/api/stripe/webhook", "/robots.txt"]);
      build(management, ["/", "/login", "/robots.txt"]);
      expect(() => verifyBuildManifestIsolation(store, management)).not.toThrow();
      expect(() => verifyBuildManifestIsolation(store, store)).toThrow("GD_BUILD_DIRECTORY_COLLISION");
      expect(() => verifyBuildManifestIsolation(management, store)).toThrow();
      build(management, ["/", "/admin"]);
      expect(() => verifyBuildManifestIsolation(store, management)).toThrow("GD_MANAGEMENT_ROUTE_FORBIDDEN");
      build(management, ["/", "/robots.txt"]);
      rmSync(join(management, "BUILD_ID"));
      expect(() => verifyBuildManifestIsolation(store, management)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
