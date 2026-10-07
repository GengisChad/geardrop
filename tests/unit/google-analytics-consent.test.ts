import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/data/pages";
import {
  analyticsCookieNames,
  CONSENT_MAX_AGE_MS,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  marketingCookieNames,
  readConsent,
  writeConsent,
} from "@/lib/analytics/consent";
import {
  analyticsPageLocation,
  consentState,
  denyMarketing,
  disableGoogleAnalytics,
  dropQueuedEvents,
  gaConfig,
  gaItem,
  GA_MEASUREMENT_ID,
  loadGoogleAnalytics,
  purchaseEvent,
  sendGaEvent,
  sendPageView,
} from "@/lib/analytics/google";

const NOW = Date.parse("2026-10-07T10:00:00Z");
const STATS = { analytics: true, marketing: false } as const;
const ALL = { analytics: true, marketing: true } as const;

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
const events = (win: Record<string, unknown>) => calls(win).filter(([kind]) => kind === "event");

describe("the cookie choice", () => {
  it("is kept for six months, then asked again", () => {
    const storage = memoryStorage();
    writeConsent(ALL, storage, NOW);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: true, marketing: true, version: CONSENT_VERSION });
    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS + 1)).toBeNull();
  });

  it("keeps statistics and marketing apart, and a refusal as a choice", () => {
    const storage = memoryStorage();
    writeConsent(STATS, storage, NOW);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: true, marketing: false });
    writeConsent({ analytics: false, marketing: false }, storage, NOW);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: false, marketing: false });
  });

  it("asks again when the answer was given to the old banner, which never asked about marketing", () => {
    const storage = memoryStorage();
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: new Date(NOW).toISOString(), version: 1 }));
    expect(readConsent(storage, NOW)).toBeNull();
    storage.setItem(CONSENT_STORAGE_KEY, "{not json");
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
    expect(writeConsent(ALL, refusing, NOW)).toMatchObject({ analytics: true, marketing: true });
    expect(readConsent(refusing, NOW)).toBeNull();
  });

  it("finds Google's own cookies for each purpose and nothing else", () => {
    const header = "gd-cart=1; _ga=GA1.1.2; _ga_XD1W9C6GWG=GS1; sb-access=x; _gid=3; _gcl_au=1.1.9";
    expect(analyticsCookieNames(header)).toEqual(["_ga", "_ga_XD1W9C6GWG", "_gid"]);
    expect(marketingCookieNames(header)).toEqual(["_gcl_au"]);
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

  it("loads nothing without statistics, then the tag once, with ad signals only for marketing", () => {
    const { win, appended } = fakeWindow();
    loadGoogleAnalytics({ analytics: false, marketing: true }, win);
    expect(appended).toHaveLength(0);

    loadGoogleAnalytics(STATS, win);
    loadGoogleAnalytics(STATS, win);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
    expect(calls(win)).toContainEqual(["consent", "default", consentState(STATS)]);
    expect(consentState(STATS)).toEqual({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(calls(win)).toContainEqual(["config", GA_MEASUREMENT_ID, gaConfig(STATS)]);
    expect(gaConfig(STATS)).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });

    // Marketing accepted later: the running tag is told, nothing is loaded twice.
    loadGoogleAnalytics(ALL, win);
    expect(appended).toHaveLength(1);
    expect(calls(win)).toContainEqual(["consent", "update", consentState(ALL)]);
    expect(consentState(ALL)).toEqual({ analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
  });

  it("counts a page view only where allowed, and stops when consent is withdrawn", () => {
    const { win, cookies } = fakeWindow();
    expect(sendPageView("/negozio", win)).toBe(false); // no tag loaded yet
    loadGoogleAnalytics(STATS, win);
    expect(sendPageView("/negozio", win)).toBe(true);
    expect(sendPageView("/account", win)).toBe(false);
    expect(events(win)).toEqual([
      ["event", "page_view", { page_location: "https://geardropshop.it/negozio", page_title: "GEAR//DROP" }],
    ]);

    disableGoogleAnalytics(["_ga", "_ga_XD1W9C6GWG", "_gcl_au"], win);
    expect(sendPageView("/negozio", win)).toBe(false);
    expect(calls(win)).toContainEqual(["consent", "update", consentState({ analytics: false, marketing: false })]);
    expect(cookies).toContain("_ga=; Max-Age=0; path=/; domain=.geardropshop.it");
    expect(cookies).toContain("_gcl_au=; Max-Age=0; path=/");
  });

  it("drops the ad signals and the Ads cookie when only marketing is withdrawn", () => {
    const { win, cookies } = fakeWindow();
    loadGoogleAnalytics(ALL, win);
    denyMarketing(["_gcl_au"], win);
    expect(calls(win)).toContainEqual(["consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(cookies).toContain("_gcl_au=; Max-Age=0; path=/");
    expect(sendPageView("/negozio", win)).toBe(true); // statistics continue
  });
});

describe("ecommerce events", () => {
  it("holds an event raised before the choice is read, sends it on acceptance, and never on refusal", () => {
    const accepted = fakeWindow().win;
    let sent = 0;
    expect(sendGaEvent("purchase", { value: 23 }, accepted, () => (sent += 1))).toBe("queued");
    expect(accepted["gtag"]).toBeUndefined();
    expect(sent).toBe(0); // not marked as sent while it only waits
    loadGoogleAnalytics(STATS, accepted);
    expect(events(accepted)).toEqual([["event", "purchase", { page_location: "https://geardropshop.it/", value: 23 }]]);
    expect(sent).toBe(1);

    const refused = fakeWindow().win;
    let refusedSent = 0;
    sendGaEvent("purchase", { value: 23 }, refused, () => (refusedSent += 1));
    dropQueuedEvents(refused);
    loadGoogleAnalytics({ analytics: false, marketing: false }, refused);
    expect(events(refused)).toEqual([]);
    expect(refused["gtag"]).toBeUndefined();
    expect(refusedSent).toBe(0); // a refused sale can still be counted on a later visit
  });

  it("reports the page by its path only, and sends nothing from a private page", () => {
    const { win } = fakeWindow("/checkout/successo");
    (win as unknown as { location: { search: string } }).location.search = "?session_id=cs_live_secret";
    loadGoogleAnalytics(STATS, win);
    expect(sendGaEvent("purchase", { value: 10 }, win)).toBe("sent");
    expect(events(win).at(-1)).toEqual(["event", "purchase", { page_location: "https://geardropshop.it/checkout/successo", value: 10 }]);
    expect(JSON.stringify(calls(win))).not.toContain("cs_live_secret");

    const account = fakeWindow("/account/ordini").win;
    loadGoogleAnalytics(STATS, account);
    expect(sendGaEvent("view_item", { value: 1 }, account)).toBe("dropped");
    expect(events(account)).toEqual([]);
  });

  it("describes a purchase as GA4 and Google Ads read it: goods value, shipping apart, order reference as id", () => {
    const items = [
      gaItem({ slug: "cobalt-dragoon-2-60c", name: "Cobalt Dragoon 2-60C", priceCents: 2300, quantity: 1 }),
      gaItem({ slug: "shadow-shinobi-1-80mn", name: "Shadow Shinobi 1-80MN", priceCents: 999, quantity: 2 }),
    ];
    expect(purchaseEvent({ reference: "GD-ABCDEFGH", totalCents: 4863, shippingCents: 565, items })).toEqual({
      transaction_id: "GD-ABCDEFGH",
      currency: "EUR",
      value: 42.98,
      shipping: 5.65,
      items: [
        { item_id: "cobalt-dragoon-2-60c", item_name: "Cobalt Dragoon 2-60C", quantity: 1, price: 23 },
        { item_id: "shadow-shinobi-1-80mn", item_name: "Shadow Shinobi 1-80MN", quantity: 2, price: 9.99 },
      ],
    });
    // An item whose price is unknown is still counted, without a made-up price.
    expect(gaItem({ slug: "x", name: "X", priceCents: null, quantity: 1 })).toEqual({ item_id: "x", item_name: "X", quantity: 1 });
  });

  it("is raised on the product page, the cart button, the checkout and the paid confirmation, once per order", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(read("src/app/(storefront)/prodotto/[slug]/page.tsx")).toContain('name="view_item"');
    const button = read("src/components/product/add-to-cart-button.tsx");
    expect(button).toContain('sendGaEvent("add_to_cart"');
    expect(button).toContain('{ currency: "EUR", value: (priceCents * quantity) / 100 }');
    expect(read("src/app/(storefront)/checkout/checkout-client.tsx")).toContain('sendGaEvent("begin_checkout"');
    const success = read("src/app/(storefront)/checkout/successo/page.tsx");
    expect(success).toContain('name="purchase"');
    expect(success).toContain("onceKey={`gd-ga-purchase-${session.reference}`}");
    expect(success).toContain("{paid ? <PurchaseEvent session={session} /> : null}");
  });
});

describe("the banner and the policy", () => {
  it("gives Accetta tutto and Rifiuta the same weight, lets each purpose be chosen unticked, and the X refuses", () => {
    // Line endings normalised: a Windows checkout reads the file with CRLF.
    const source = readFileSync(join(process.cwd(), "src/components/analytics/cookie-consent.tsx"), "utf8").replaceAll("\r\n", "\n");
    expect(source).toMatch(/variant="glass" size="sm" type="button" onClick=\{\(\) => choose\(NONE\)\} data-testid="cookie-reject"/);
    expect(source).toMatch(/variant="glass" size="sm" type="button" onClick=\{\(\) => choose\(ALL\)\} data-testid="cookie-accept"/);
    expect(source).toContain('aria-label="Chiudi e rifiuta i cookie non necessari"');
    expect(source).toContain('data-testid="cookie-analytics"');
    expect(source).toContain('data-testid="cookie-marketing"');
    // "Personalizza" starts from nothing ticked.
    expect(source).toContain("setDraft(NONE);\n            setCustomizing(true);");
    const layout = readFileSync(join(process.cwd(), "src/app/(storefront)/layout.tsx"), "utf8");
    expect(layout).toContain("<CookieConsent enabled={googleAnalyticsEnabled} />");
    expect(layout).toContain('process.env["VERCEL_ENV"] === "production"');
  });

  it("tells the visitor what Google Analytics and Google Ads do, on what basis, and how to withdraw", () => {
    const text = JSON.stringify(LEGAL_PAGES.privacy);
    expect(text).toContain("Google Analytics 4 (_ga e _ga_<ID>, durata massima 2 anni; _gid, durata 24 ore)");
    expect(text).toContain("_gcl_aw e _gcl_dc");
    expect(text).toContain("Google Ads");
    expect(text).toContain("_gcl_au");
    expect(text).toContain("art. 6.1.a GDPR");
    expect(text).toContain("Google Ireland Limited");
    expect(text).toContain("«Gestisci cookie»");
    expect(text).not.toContain("Il sito usa solo strumenti tecnici");
    expect(text).not.toContain("Non usiamo i dati per profilazione né per inviarti pubblicità");
  });
});
