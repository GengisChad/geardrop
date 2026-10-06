import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/data/pages";
import {
  analyticsCookieNames,
  CONSENT_MAX_AGE_MS,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  readConsent,
  writeConsent,
} from "@/lib/analytics/consent";
import {
  analyticsPageLocation,
  disableGoogleAnalytics,
  GA_CONFIG,
  GA_MEASUREMENT_ID,
  loadGoogleAnalytics,
  sendPageView,
} from "@/lib/analytics/google";

const NOW = Date.parse("2026-10-07T10:00:00Z");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

/** Just enough of a browser window for the tag loader: a head, cookies, a location. */
function fakeWindow(pathname = "/") {
  const appended: { id: string; src: string; async: boolean }[] = [];
  const cookies: string[] = [];
  const document = {
    title: "GEAR//DROP",
    head: { appendChild: (node: { id: string; src: string; async: boolean }) => void appended.push(node) },
    createElement: () => ({ id: "", src: "", async: false }),
    getElementById: (id: string) => appended.find((node) => node.id === id) ?? null,
    set cookie(value: string) {
      cookies.push(value);
    },
  };
  const win = { document, location: { origin: "https://geardropshop.it", hostname: "geardropshop.it", pathname } };
  return { win: win as unknown as Window & Record<string, unknown>, appended, cookies };
}

const calls = (win: Record<string, unknown>) =>
  ((win["dataLayer"] as IArguments[] | undefined) ?? []).map((entry) => Array.from(entry));

describe("the cookie choice", () => {
  it("is kept for six months, then asked again", () => {
    const storage = memoryStorage();
    writeConsent(true, storage, NOW);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: true, version: CONSENT_VERSION });
    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS + 1)).toBeNull();
  });

  it("keeps a refusal as a choice, not as no answer", () => {
    const storage = memoryStorage();
    writeConsent(false, storage, NOW);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: false });
  });

  it("asks again when the stored answer is unreadable or from an older banner", () => {
    const storage = memoryStorage();
    storage.setItem(CONSENT_STORAGE_KEY, "{not json");
    expect(readConsent(storage, NOW)).toBeNull();
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: new Date(NOW).toISOString(), version: CONSENT_VERSION - 1 }));
    expect(readConsent(storage, NOW)).toBeNull();
    expect(readConsent(null, NOW)).toBeNull();
  });

  it("survives a browser that refuses storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(writeConsent(true, refusing, NOW)).toMatchObject({ analytics: true });
    expect(readConsent(refusing, NOW)).toBeNull();
  });

  it("finds Google Analytics' own cookies and nothing else", () => {
    expect(analyticsCookieNames("gd-cart=1; _ga=GA1.1.2; _ga_XD1W9C6GWG=GS1; sb-access=x; _gid=3")).toEqual([
      "_ga",
      "_ga_XD1W9C6GWG",
      "_gid",
    ]);
  });
});

describe("what Google Analytics may see", () => {
  it("sees catalogue and funnel pages without query strings, and no account or auth page", () => {
    const origin = "https://geardropshop.it";
    expect(analyticsPageLocation(origin, "/prodotto/cobalt-dragoon-2-60c")).toBe(`${origin}/prodotto/cobalt-dragoon-2-60c`);
    expect(analyticsPageLocation(origin, "/carrello")).toBe(`${origin}/carrello`);
    expect(analyticsPageLocation(origin, "/checkout")).toBe(`${origin}/checkout`);
    expect(analyticsPageLocation(origin, "/checkout/successo")).toBe(`${origin}/checkout/successo`);
    for (const path of ["/account", "/account/ordini", "/admin", "/login", "/nuova-password", "/conferma-email"]) {
      expect(analyticsPageLocation(origin, path), path).toBeNull();
    }
  });

  it("loads nothing from Google until asked, then the tag once, with ads and signals off", () => {
    const { win, appended } = fakeWindow();
    expect(appended).toHaveLength(0);
    loadGoogleAnalytics(win);
    loadGoogleAnalytics(win);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
    const sent = calls(win);
    expect(sent).toContainEqual([
      "consent",
      "default",
      { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
    expect(sent).toContainEqual(["config", GA_MEASUREMENT_ID, GA_CONFIG]);
    expect(GA_CONFIG).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  });

  it("counts a page view only where allowed, and stops when consent is withdrawn", () => {
    const { win, cookies } = fakeWindow();
    expect(sendPageView("/negozio", win)).toBe(false); // no tag loaded yet
    loadGoogleAnalytics(win);
    expect(sendPageView("/negozio", win)).toBe(true);
    expect(sendPageView("/account", win)).toBe(false);
    expect(calls(win).filter(([kind]) => kind === "event")).toEqual([
      ["event", "page_view", { page_location: "https://geardropshop.it/negozio", page_title: "GEAR//DROP" }],
    ]);

    disableGoogleAnalytics(["_ga", "_ga_XD1W9C6GWG"], win);
    expect(sendPageView("/negozio", win)).toBe(false);
    expect(calls(win)).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(cookies).toContain("_ga=; Max-Age=0; path=/; domain=.geardropshop.it");
    expect(cookies).toContain("_ga_XD1W9C6GWG=; Max-Age=0; path=/");
  });
});

describe("the banner and the policy", () => {
  it("gives Accetta and Rifiuta the same weight, and the X refuses", () => {
    const source = readFileSync(join(process.cwd(), "src/components/analytics/cookie-consent.tsx"), "utf8");
    expect(source.match(/variant="glass" size="sm"/g)).toHaveLength(2);
    expect(source).toContain('aria-label="Chiudi e rifiuta i cookie di statistica"');
    const layout = readFileSync(join(process.cwd(), "src/app/(storefront)/layout.tsx"), "utf8");
    expect(layout).toContain("<CookieConsent enabled={googleAnalyticsEnabled} />");
    expect(layout).toContain('process.env["VERCEL_ENV"] === "production"');
  });

  it("tells the visitor what Google Analytics does, on what basis, and how to withdraw", () => {
    const text = JSON.stringify(LEGAL_PAGES.privacy);
    expect(text).toContain("Google Analytics 4 (_ga e _ga_<ID>, durata massima 2 anni)");
    expect(text).toContain("art. 6.1.a GDPR");
    expect(text).toContain("Google Ireland Limited");
    expect(text).toContain("«Gestisci cookie»");
    expect(text).not.toContain("Il sito usa solo strumenti tecnici");
  });
});
