import { describe, expect, it } from "vitest";
import { gestionaleRedirectSource, isGestionaleOnly } from "@/lib/app-mode";
import nextConfig from "../../next.config";

/** The redirect source as Next matches it: `/:path(<pattern>)` over the whole path. */
function redirected(pathname: string): boolean {
  const pattern = /^\/:path\((.*)\)$/.exec(gestionaleRedirectSource())?.[1];
  return new RegExp(`^/(${pattern})$`).test(pathname);
}

describe("management app mode", () => {
  it("is on only with GESTIONALE_ONLY=true", () => {
    expect(isGestionaleOnly({ GESTIONALE_ONLY: "true" })).toBe(true);
    expect(isGestionaleOnly({ GESTIONALE_ONLY: "1" })).toBe(false);
    expect(isGestionaleOnly({})).toBe(false);
  });

  it("sends every shop page to the admin", () => {
    for (const path of ["/", "/negozio", "/prodotto/cobalt-drake-4-60f", "/checkout", "/account", "/login", "/sitemap.xml"]) {
      expect(redirected(path), path).toBe(true);
    }
  });

  it("keeps the admin, auth, APIs, Next assets and the files that make it installable", () => {
    for (const path of ["/admin", "/admin/ordini/12", "/auth/callback", "/api/stripe/webhook", "/_next/static/x.js",
      "/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/gestionale-192.png", "/products/x.webp", "/robots.txt"]) {
      expect(redirected(path), path).toBe(false);
    }
  });

  it("leaves the shop deployment's redirects as they were", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual([
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ]);
    expect(await nextConfig.headers?.()).toEqual([]);
  });
});
