import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as deployment from "@/lib/app-mode";
import { proxy as storefrontProxy } from "@/proxy";
import robots from "@/app/robots";
import nextConfig from "../../next.config";

const managementEnv = {
  NEXT_PUBLIC_APP_SURFACE: "management", MANAGEMENT_ORIGIN: "https://management-ci.invalid",
  STOREFRONT_ORIGIN: "https://storefront-ci.invalid", NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "ci-management",
  NEXT_PUBLIC_SUPABASE_URL: "https://ci-management.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-publishable-key",
};
const contract = () => deployment.readDeploymentContract(managementEnv);
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("direct management route ownership", () => {
  it.each(["/", "/login", "/logout", "/account", "/settings/security", "/mfa/enroll", "/mfa/challenge", "/auth/callback"])("allows clean %s without rewriting", path => {
    expect(deployment.classifyManagementRequest(path, "GET", contract())).toEqual({ kind: "allow" });
  });
  it.each(["/_next/static/chunks/app.js", "/_next/image", "/management.webmanifest", "/management-sw.js", "/management-offline.html", "/icons/gestionale-192.png", "/favicon.ico", "/robots.txt"])("allows management infrastructure: %s", path => {
    expect(deployment.classifyManagementRequest(path, "GET", contract())).toEqual({ kind: "allow" });
    expect(deployment.classifyManagementRequest(path, "POST", contract())).toEqual({ kind: "not_found" });
  });
  it.each(["/negozio", "/prodotto/item", "/carrello", "/ricerca", "/assistenza"])("redirects readable shop paths: %s", path => {
    expect(deployment.classifyManagementRequest(path, "HEAD", contract())).toEqual({ kind: "redirect", destination: "https://storefront-ci.invalid" + path });
    expect(deployment.classifyManagementRequest(path, "POST", contract())).toEqual({ kind: "not_found" });
  });
  it.each(["/api/stripe/webhook", "/api/preview", "/checkout", "/unknown", "/gestionale", "/products/x.webp", "/sitemap.xml"])("blocks application paths not owned here: %s", path => {
    for (const method of ["GET", "POST"]) expect(deployment.classifyManagementRequest(path, method, contract())).toEqual({ kind: "not_found" });
  });
  it("keeps admin GET redirects and blocks writes on the management origin", () => {
    expect(deployment.classifyManagementRequest("/admin/orders", "GET", contract())).toEqual({ kind: "redirect", destination: "https://management-ci.invalid/" });
    expect(deployment.classifyManagementRequest("/admin/orders", "POST", contract())).toEqual({ kind: "not_found" });
  });
  it("allows application POST except callback and rejects unsupported methods", () => {
    expect(deployment.classifyManagementRequest("/logout", "POST", contract())).toEqual({ kind: "allow" });
    expect(deployment.classifyManagementRequest("/auth/callback", "POST", contract())).toEqual({ kind: "not_found" });
    expect(deployment.classifyManagementRequest("/login", "DELETE", contract())).toEqual({ kind: "not_found" });
  });
});

describe("application-specific config consumers", () => {
  it("preserves storefront redirects, robots and its legacy routes", async () => {
    expect(await nextConfig.redirects?.()).toEqual([{ source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false }]);
    expect(nextConfig.rewrites).toBeUndefined();
    expect(robots()).toHaveProperty("sitemap");
    for (const path of ["/admin", "/checkout", "/api/stripe/webhook"]) expect((await storefrontProxy(new NextRequest("https://storefront-ci.invalid" + path))).status).toBe(200);
  });
  it("enforces private noindex headers in the independent config", async () => {
    for (const [name, value] of Object.entries(managementEnv)) vi.stubEnv(name, value);
    const { default: config } = await import("../../apps/management/next.config");
    expect(config.rewrites).toBeUndefined();
    expect(await config.headers?.()).toEqual([{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" },
    ] }]);
    const { default: managementRobots } = await import("../../apps/management/src/app/robots");
    expect(managementRobots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(() => storefrontProxy(new NextRequest("https://storefront-ci.invalid/admin"))).toThrow("GD_ROOT_MANAGEMENT_BUILD_UNSUPPORTED");
  });
});
