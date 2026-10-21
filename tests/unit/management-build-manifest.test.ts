import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function verifier() {
  expect(existsSync(resolve("scripts/verify-management-build-manifest.ts"))).toBe(true);
  return import("../../scripts/verify-management-build-manifest");
}
describe("management manifest allowlist", () => {
  it("accepts only owned routes and explicit Next infrastructure", async () => {
    const { managementManifestRoutes, assertManagementRoutes } = await verifier();
    const routes = managementManifestRoutes({
      routes: { staticRoutes: [{ page: "/" }, { page: "/robots.txt" }], dynamicRoutes: [], redirects: [], rewrites: [] },
      appPaths: { "/page": "app/page.js", "/robots.txt/route": "app/robots.txt/route.js", "/_not-found/page": "app/_not-found/page.js" },
      pages: { "/_app": "pages/_app.js", "/_document": "pages/_document.js", "/_error": "pages/_error.js", "/404": "pages/404.html", "/500": "pages/500.html" },
      prerender: { routes: { "/robots.txt": {} }, dynamicRoutes: {} },
      appRoutes: { "/page": "/", "/robots.txt/route": "/robots.txt" },
    });
    expect(routes).toContain("/");
    expect(() => assertManagementRoutes(routes)).not.toThrow();
  });
  it.each(["/admin", "/api/stripe/webhook", "/checkout", "/carrello", "/negozio", "/prodotti", "/webhook", "/mfa/[slug]", "/gestionale", "/surprise"])("rejects unexpected application route %s", async (path) => {
    const { managementManifestRoutes, assertManagementRoutes } = await verifier();
    for (const manifests of [
      { appPaths: { [`${path}/page`]: "x.js" } },
      { routes: { dynamicRoutes: [{ page: path }] } },
      { prerender: { routes: { [path]: {} } } },
      { pages: { [path]: "x.js" } },
      { appRoutes: { "/page": path } },
    ]) expect(() => assertManagementRoutes(managementManifestRoutes(manifests))).toThrow("GD_MANAGEMENT_ROUTE_FORBIDDEN");
  });
  it("rejects rewrites even when their public route looks permitted", async () => {
    const { managementManifestRoutes } = await verifier();
    expect(() => managementManifestRoutes({ routes: { rewrites: [{ source: "/login", destination: "/gestionale/login" }] } })).toThrow("GD_MANAGEMENT_REWRITE_FORBIDDEN");
  });
});
