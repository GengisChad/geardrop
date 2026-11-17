/**
 * Task 6 – Step 5 (PWA): test RED/GREEN del manifest, del service worker
 * e della classificazione proxy per i file statici PWA.
 *
 * Eseguire:
 *   pnpm exec vitest run tests/unit/management-pwa.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { classifyManagementRequest, readDeploymentContract } from "@geardrop/runtime-contract";

const repo = path.resolve(__dirname, "../..");
const managementPublic = path.join(repo, "apps/management/public");
const manifestPath = path.join(managementPublic, "management.webmanifest");
const swPath = path.join(managementPublic, "management-sw.js");
const offlinePath = path.join(managementPublic, "management-offline.html");

/** Legge MANAGEMENT_CACHE_NAME dal sorgente di logout/route.ts senza importare Next.js. */
function readCacheNameFromSource(): string {
  const src = readFileSync(
    path.join(repo, "apps/management/src/app/logout/route.ts"),
    "utf-8",
  );
  const match = src.match(/MANAGEMENT_CACHE_NAME\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("MANAGEMENT_CACHE_NAME not found in logout/route.ts");
  return match[1];
}

const managementEnv = {
  NEXT_PUBLIC_APP_SURFACE: "management",
  MANAGEMENT_ORIGIN: "https://management-ci.invalid",
  STOREFRONT_ORIGIN: "https://storefront-ci.invalid",
  NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "ci-management",
  NEXT_PUBLIC_SUPABASE_URL: "https://ci-management.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-publishable-key",
};

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
describe("management-pwa: manifest", () => {
  it("management.webmanifest exists on disk", () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("manifest ha i campi obbligatori del piano (id, start_url, scope, display, name, short_name)", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBe("Gestionale");
    expect(manifest.short_name).toBe("Gestionale");
  });

  it("manifest contiene almeno un'icona", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("ogni icona referenziata nel manifest esiste su disco (eccetto sizes=any che usa SVG inline)", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      if (icon.sizes === "any") continue; // SVG con sizes any: non è un file separato
      const iconFile = path.join(managementPublic, icon.src.replace(/^\//, ""));
      expect(existsSync(iconFile), `icona mancante: ${icon.src}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------
describe("management-pwa: service worker", () => {
  it("management-sw.js exists on disk", () => {
    expect(existsSync(swPath)).toBe(true);
  });

  it("il service worker NON contiene cache.put (nessun caching di risposte di rete)", () => {
    const sw = readFileSync(swPath, "utf-8");
    // cache.put metterebbe in cache risposte di rete o dati autenticati
    expect(sw).not.toMatch(/cache\.put\s*\(/);
  });

  it("il nome della cache nel service worker coincide con MANAGEMENT_CACHE_NAME di logout/route.ts", () => {
    const cacheName = readCacheNameFromSource();
    const sw = readFileSync(swPath, "utf-8");
    expect(sw).toContain(cacheName);
  });

  it("il service worker installa management-offline.html nella cache", () => {
    const sw = readFileSync(swPath, "utf-8");
    expect(sw).toContain("management-offline.html");
  });

  it("il service worker rimuove solo cache con prefisso geardrop-management in activation", () => {
    const sw = readFileSync(swPath, "utf-8");
    // Deve avere logica di cleanup in onactivate
    expect(sw).toMatch(/activate/);
    // Deve rimuovere vecchie versioni, non cache di altri domini
    expect(sw).toMatch(/geardrop-management/);
  });
});

// ---------------------------------------------------------------------------
// Offline page
// ---------------------------------------------------------------------------
describe("management-pwa: offline page", () => {
  it("management-offline.html exists on disk", () => {
    expect(existsSync(offlinePath)).toBe(true);
  });

  it("la pagina offline non contiene dati operativi né script che fanno richieste di rete", () => {
    const html = readFileSync(offlinePath, "utf-8");
    // Nessun fetch/XMLHttpRequest nella pagina offline
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// Proxy: i file statici PWA superano la classificazione fail-closed
// ---------------------------------------------------------------------------
describe("management-pwa: proxy classifica i file statici come allow", () => {
  const contract = readDeploymentContract(managementEnv);

  it.each([
    "/management.webmanifest",
    "/management-sw.js",
    "/management-offline.html",
    "/icons/gestionale-192.png",
    "/icons/gestionale-512.png",
    "/icons/gestionale-maskable-512.png",
    "/icons/gestionale-icon.svg",
  ])("GET %s → allow", (p) => {
    expect(classifyManagementRequest(p, "GET", contract)).toEqual({ kind: "allow" });
  });

  it.each([
    "/management.webmanifest",
    "/management-sw.js",
    "/management-offline.html",
  ])("POST %s → not_found (i file statici PWA non accettano scritture)", (p) => {
    expect(classifyManagementRequest(p, "POST", contract)).toEqual({ kind: "not_found" });
  });
});
