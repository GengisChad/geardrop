import { isSensitiveAnalyticsPath } from "@/lib/analytics";

/**
 * Google Analytics 4 for geardropshop.it (property "www.geardropshop.it", stream 16040622697).
 * The measurement id is public by design — it ships in every page that loads the tag — so it is
 * kept here, with an environment override for a test property.
 */
export const GA_MEASUREMENT_ID = process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]?.trim() || "G-XD1W9C6GWG";

/**
 * Configuration sent with the tag. No Google signals and no ad personalisation: the shop uses
 * Analytics for visit statistics only, which is what the privacy page says. Page views are sent
 * by the site itself (send_page_view false) so it can leave out the same private routes and
 * query strings it already keeps out of Vercel Web Analytics.
 */
export const GA_CONFIG = {
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
} as const;

/**
 * Cart and checkout are private to Vercel's statistics, but their paths carry nothing personal and
 * they are the funnel the shop most needs to see: where buyers drop out. Exact paths only.
 */
const FUNNEL_PATHS: ReadonlySet<string> = new Set(["/carrello", "/checkout", "/checkout/successo", "/preferiti"]);

/** The page address Analytics may see: no query string, no hash, nothing on an account or auth route. */
export function analyticsPageLocation(origin: string, pathname: string): string | null {
  if (!FUNNEL_PATHS.has(pathname) && isSensitiveAnalyticsPath(pathname)) return null;
  return `${origin}${pathname}`;
}

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

const browserWindow = () => window as unknown as GtagWindow;

const SCRIPT_ID = "gd-google-analytics";
const disableFlag = `ga-disable-${GA_MEASUREMENT_ID}`;

/**
 * Loads gtag.js once, after the visitor accepted. Nothing from Google is requested before this
 * runs ("basic" consent mode): no cookie, no ping, not even the script.
 */
export function loadGoogleAnalytics(win: GtagWindow = browserWindow()): void {
  win[disableFlag] = false;
  if (win.document.getElementById(SCRIPT_ID)) {
    win.gtag?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  win.dataLayer = win.dataLayer ?? [];
  // gtag.js reads the arguments object itself, not an array: this is Google's own snippet.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer!.push(arguments);
  };
  win.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("js", new Date());
  win.gtag("config", GA_MEASUREMENT_ID, GA_CONFIG);
  const script = win.document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  win.document.head.appendChild(script);
}

/** Withdrawn consent: the loaded tag stops sending, and its cookies go. */
export function disableGoogleAnalytics(cookieNames: readonly string[], win: GtagWindow = browserWindow()): void {
  win[disableFlag] = true;
  win.gtag?.("consent", "update", { analytics_storage: "denied" });
  const host = win.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
  for (const name of cookieNames) {
    for (const domain of domains) {
      win.document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** One page view, for a path Analytics may see. */
export function sendPageView(pathname: string, win: GtagWindow = browserWindow()): boolean {
  const location = analyticsPageLocation(win.location.origin, pathname);
  if (!location || !win.gtag || win[disableFlag] === true) return false;
  win.gtag("event", "page_view", { page_location: location, page_title: win.document.title });
  return true;
}
