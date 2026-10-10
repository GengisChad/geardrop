import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { managementManifestRoutes, managementRoutes as managementRouteAllowlist, nextInternalRoutes, readBuildManifests, verifyManagementBuildManifest } from "./verify-management-build-manifest";

// Public routes independently owned by both apps, plus Next's generated error pages.
const permittedIntersection = new Set(["/", "/robots.txt", "/login", "/account", "/auth/callback", ...nextInternalRoutes]);

export function verifyBuildManifestIsolation(storefront = resolve(".next"), management = resolve("apps/management/.next")) {
  const storeDirectory = realpathSync(storefront); const managementDirectory = realpathSync(management);
  if (storeDirectory === managementDirectory) throw new Error("GD_BUILD_DIRECTORY_COLLISION");
  for (const directory of [storeDirectory, managementDirectory]) {
    if (!readFileSync(join(directory, "BUILD_ID"), "utf8").trim()) throw new Error("GD_BUILD_ID_MISSING");
  }
  const storeRoutes = managementManifestRoutes(readBuildManifests(storeDirectory), false);
  const managementRoutes = verifyManagementBuildManifest(managementDirectory);
  for (const required of ["/admin", "/api/stripe/webhook"]) if (!storeRoutes.includes(required)) throw new Error(`GD_STOREFRONT_ROUTE_MISSING: ${required}`);
  for (const route of managementRouteAllowlist) if (storeRoutes.includes(route) && !permittedIntersection.has(route)) throw new Error(`GD_ROUTE_OWNERSHIP_COLLISION: ${route}`);
  return { storefront: storeRoutes.length, management: managementRoutes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log("Build manifest isolation: PASS", verifyBuildManifestIsolation());
}
