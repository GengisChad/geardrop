import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type RouteEntry = { page: string };
type ManifestSet = {
  routes?: { staticRoutes?: RouteEntry[]; dynamicRoutes?: RouteEntry[]; redirects?: unknown[]; rewrites?: unknown[] | Record<string, unknown[]> };
  appPaths?: Record<string, string>;
  appRoutes?: Record<string, string>;
  pages?: Record<string, string>;
  prerender?: { routes?: Record<string, unknown>; dynamicRoutes?: Record<string, unknown> };
};
export const managementRoutes = new Set(["/", "/login", "/logout", "/account", "/settings/security", "/mfa/enroll", "/mfa/challenge", "/auth/callback", "/robots.txt"]);
// Next 16 generated error entry points, never application-owned routes.
export const nextInternalRoutes = new Set(["/_not-found", "/_global-error", "/_app", "/_document", "/_error", "/404", "/500"]);

function normalize(path: string, appPath = false): string {
  let result = path.replaceAll("\\", "/");
  if (appPath) result = result.split("/").filter(segment => !(segment.startsWith("(") && segment.endsWith(")")) && !segment.startsWith("@")).join("/").replace(/\/(?:page|route)$/, "");
  return result.replace(/\/$/, "") || "/";
}

export function managementManifestRoutes(manifests: ManifestSet, forbidRewrites = true): string[] {
  const rewrites = manifests.routes?.rewrites;
  if (forbidRewrites && rewrites && (Array.isArray(rewrites) ? rewrites.length : Object.values(rewrites).some(entries => entries.length))) throw new Error("GD_MANAGEMENT_REWRITE_FORBIDDEN");
  return [...new Set([
    ...(manifests.routes?.staticRoutes ?? []).map(route => normalize(route.page)),
    ...(manifests.routes?.dynamicRoutes ?? []).map(route => normalize(route.page)),
    ...Object.keys(manifests.appPaths ?? {}).map(path => normalize(path, true)),
    ...Object.values(manifests.appRoutes ?? {}).map(path => normalize(path)),
    ...Object.keys(manifests.pages ?? {}).map(path => normalize(path)),
    ...Object.keys(manifests.prerender?.routes ?? {}).map(path => normalize(path)),
    ...Object.keys(manifests.prerender?.dynamicRoutes ?? {}).map(path => normalize(path)),
  ])].sort();
}

export function assertManagementRoutes(routes: readonly string[]): void {
  for (const path of routes) {
    if (/^\/(?:admin|api|checkout|carrello|negozio|prodotti|webhook)(?:\/|$)/.test(path) || (!managementRoutes.has(path) && !nextInternalRoutes.has(path))) throw new Error(`GD_MANAGEMENT_ROUTE_FORBIDDEN: ${path}`);
  }
}

export function readBuildManifests(directory: string): ManifestSet {
  const read = (path: string) => JSON.parse(readFileSync(join(directory, path), "utf8"));
  return {
    routes: read("routes-manifest.json"), appPaths: read("server/app-paths-manifest.json"),
    pages: read("server/pages-manifest.json"), prerender: read("prerender-manifest.json"),
    appRoutes: read("app-path-routes-manifest.json"),
  };
}

export function verifyManagementBuildManifest(directory = resolve("apps/management/.next")): string[] {
  const routes = managementManifestRoutes(readBuildManifests(directory));
  assertManagementRoutes(routes);
  if (!routes.includes("/") || !routes.includes("/robots.txt")) throw new Error("GD_MANAGEMENT_FOUNDATION_MISSING");
  return routes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log("Management manifest: PASS", verifyManagementBuildManifest());
}
