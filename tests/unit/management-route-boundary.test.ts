import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as deployment from "@/lib/app-mode";
import * as routes from "@/lib/management/routes";
import { proxy } from "@/proxy";
import robots from "@/app/robots";
import nextConfig from "../../next.config";

const managementEnv = {
  NEXT_PUBLIC_APP_SURFACE: "management",
  MANAGEMENT_ORIGIN: "https://management.example",
  STOREFRONT_ORIGIN: "https://shop.example",
  NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "project-abc",
};

function managementContract() {
  return deployment.readDeploymentContract(managementEnv);
}

afterEach(() => vi.unstubAllEnvs());

describe("management route classification", () => {
  it.each([
    ["/", "/gestionale"],
    ["/login", "/gestionale/login"],
    ["/logout", "/gestionale/logout"],
    ["/account", "/gestionale/account"],
    ["/settings/security", "/gestionale/settings/security"],
    ["/mfa/enroll", "/gestionale/mfa/enroll"],
    ["/mfa/challenge", "/gestionale/mfa/challenge"],
  ])("rewrites clean %s to internal %s", (pathname, internal) => {
    expect(routes.managementInternalPath(pathname)).toBe(internal);
    expect(deployment.classifyRequest(pathname, "GET", managementContract())).toEqual({ kind: "rewrite", destination: internal });
  });

  it.each(["/auth/callback", "/_next/static/chunks/app.js", "/_next/image", "/management.webmanifest",
    "/management-sw.js", "/management-offline.html", "/icons/gestionale-192.png", "/favicon.ico", "/robots.txt"])
  ("allows only needed shared/management assets: %s", (pathname) => {
    expect(deployment.classifyRequest(pathname, "GET", managementContract())).toEqual({ kind: "allow" });
  });

  it.each(["/negozio", "/negozio/beyblade-x", "/prodotto/cobalt-drake", "/carrello", "/ricerca", "/assistenza"])
  ("sends explicit shop GET/HEAD paths to the storefront: %s", (pathname) => {
    for (const method of ["GET", "HEAD"]) {
      expect(deployment.classifyRequest(pathname, method, managementContract())).toEqual({
        kind: "redirect", destination: `https://shop.example${pathname}`,
      });
    }
  });

  it.each([
    ["/admin", "GET", { kind: "redirect", destination: "https://management.example/" }],
    ["/admin/ordini", "HEAD", { kind: "redirect", destination: "https://management.example/" }],
    ["/api/stripe/webhook", "POST", { kind: "not_found" }],
    ["/api/preview", "GET", { kind: "not_found" }],
    ["/checkout", "GET", { kind: "not_found" }],
    ["/checkout/successo", "HEAD", { kind: "not_found" }],
    ["/unknown", "POST", { kind: "not_found" }],
    ["/products/x.webp", "GET", { kind: "not_found" }],
    ["/manifest.webmanifest", "GET", { kind: "not_found" }],
    ["/gestionale", "GET", { kind: "not_found" }],
    ["/sitemap.xml", "GET", { kind: "not_found" }],
  ] as const)("blocks or redirects %s %s", (pathname, method, expected) => {
    expect(deployment.classifyRequest(pathname, method, managementContract())).toEqual(expected);
  });
});

describe("deployment configuration and proxy", () => {
  it("keeps storefront redirects and robots when no surface is selected", async () => {
    expect(await nextConfig.redirects?.()).toEqual([
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ]);
    expect(await nextConfig.headers?.()).toEqual([]);
    expect(robots()).toHaveProperty("sitemap");
  });

  it("registers management rewrites and private noindex headers", async () => {
    for (const [name, value] of Object.entries(managementEnv)) vi.stubEnv(name, value);
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual(expect.arrayContaining([
      { source: "/", destination: "/gestionale" },
      { source: "/login", destination: "/gestionale/login" },
      { source: "/mfa/:path*", destination: "/gestionale/mfa/:path*" },
    ]));
    expect(await nextConfig.headers?.()).toEqual(expect.arrayContaining([
      { source: "/", headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "private, no-store" },
      ] },
      { source: "/mfa/:path*", headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "private, no-store" },
      ] },
    ]));
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });

  it("returns 404 before Supabase refresh on the management webhook", async () => {
    for (const [name, value] of Object.entries(managementEnv)) vi.stubEnv(name, value);
    const response = await proxy(new NextRequest("https://management.example/api/stripe/webhook", { method: "POST" }));
    expect(response.status).toBe(404);
  });

  it("redirects management shop paths and keeps the storefront admin available", async () => {
    for (const [name, value] of Object.entries(managementEnv)) vi.stubEnv(name, value);
    const managementResponse = await proxy(new NextRequest("https://management.example/negozio", { method: "HEAD" }));
    expect(managementResponse.status).toBe(307);
    expect(managementResponse.headers.get("location")).toBe("https://shop.example/negozio");
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "storefront");
    const storefrontResponse = await proxy(new NextRequest("https://shop.example/admin"));
    expect(storefrontResponse.status).toBe(200);
  });
});
