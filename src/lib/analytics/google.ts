import { isSensitiveAnalyticsPath } from "@/lib/analytics";
import type { ConsentPurposes } from "@/lib/analytics/consent";

/**
 * Google Analytics 4 for geardropshop.it (property "www.geardropshop.it", stream 16040622697).
 * The measurement id is public by design — it ships in every page that loads the tag — so it is
 * kept here, with an environment override for a test property.
 */
export const GA_MEASUREMENT_ID = process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]?.trim() || "G-XD1W9C6GWG";

/**
 * Configuration sent with the tag. Page views are sent by the site itself (send_page_view false)
 * so it can leave out the same private routes and query strings it keeps out of Vercel Web
 * Analytics. Google signals stay off; ad personalisation follows the marketing choice.
 */
export function gaConfig(purposes: ConsentPurposes) {
  return {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: purposes.marketing,
  } as const;
}

/** Consent mode values for a choice: analytics_storage follows statistics, the ad signals follow marketing. */
export function consentState(purposes: ConsentPurposes) {
  const ads = purposes.marketing ? "granted" : "denied";
  return {
    analytics_storage: purposes.analytics ? "granted" : "denied",
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  } as const;
}

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

type QueuedEvent = { readonly name: string; readonly params: Record<string, unknown>; readonly onSent?: () => void };
type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  gdGaQueue?: QueuedEvent[];
} & Record<string, unknown>;

const browserWindow = () => window as unknown as GtagWindow;

const SCRIPT_ID = "gd-google-analytics";
const disableFlag = `ga-disable-${GA_MEASUREMENT_ID}`;
/** Events raised before the visitor's choice is read wait here, and are dropped if the answer is no. */
const MAX_QUEUED = 20;

/**
 * Loads gtag.js once, after the visitor accepted statistics. Nothing from Google is requested
 * before this runs ("basic" consent mode): no cookie, no ping, not even the script. Marketing on
 * top grants the ad signals Google Ads needs to count the sales its campaigns bring.
 */
export function loadGoogleAnalytics(purposes: ConsentPurposes, win: GtagWindow = browserWindow()): void {
  if (!purposes.analytics) return;
  win[disableFlag] = false;
  if (win.document.getElementById(SCRIPT_ID)) {
    win.gtag?.("consent", "update", consentState(purposes));
    win.gtag?.("set", { allow_ad_personalization_signals: purposes.marketing });
  } else {
    win.dataLayer = win.dataLayer ?? [];
    // gtag.js reads the arguments object itself, not an array: this is Google's own snippet.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
    win.gtag("consent", "default", consentState(purposes));
    win.gtag("js", new Date());
    win.gtag("config", GA_MEASUREMENT_ID, gaConfig(purposes));
    const script = win.document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    win.document.head.appendChild(script);
  }
  for (const event of win.gdGaQueue?.splice(0) ?? []) {
    win.gtag?.("event", event.name, event.params);
    event.onSent?.();
  }
}

/** Withdrawn consent: the loaded tag stops sending, queued events are dropped, and the cookies go. */
export function disableGoogleAnalytics(cookieNames: readonly string[], win: GtagWindow = browserWindow()): void {
  win[disableFlag] = true;
  win.gdGaQueue = [];
  win.gtag?.("consent", "update", consentState({ analytics: false, marketing: false }));
  disableCookies(cookieNames, win);
}

/** Marketing withdrawn while statistics stay: the ad signals go back to denied. */
export function denyMarketing(cookieNames: readonly string[], win: GtagWindow = browserWindow()): void {
  win.gtag?.("consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  win.gtag?.("set", { allow_ad_personalization_signals: false });
  disableCookies(cookieNames, win);
}

function disableCookies(cookieNames: readonly string[], win: GtagWindow) {
  const host = win.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
  for (const name of cookieNames) {
    for (const domain of domains) {
      win.document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** The visitor said no to statistics: events held for an answer are thrown away, unsent. */
export function dropQueuedEvents(win: GtagWindow = browserWindow()): void {
  win.gdGaQueue = [];
}

/** One page view, for a path Analytics may see. */
export function sendPageView(pathname: string, win: GtagWindow = browserWindow()): boolean {
  const location = analyticsPageLocation(win.location.origin, pathname);
  if (!location || !win.gtag || win[disableFlag] === true) return false;
  win.gtag("event", "page_view", { page_location: location, page_title: win.document.title });
  return true;
}

/**
 * A GA4 event. Sent at once when the tag is running; otherwise held until the visitor's choice is
 * read (a page's own effects run before the banner's), and never sent if that choice is no.
 *
 * Every event carries the page as Analytics may see it, path only: gtag would otherwise report the
 * full address, and the order confirmation's carries Stripe's session id. Nothing is sent from a
 * private page. `onSent` runs once the event has actually been handed to Google.
 */
export function sendGaEvent(
  name: string,
  params: Record<string, unknown>,
  win: GtagWindow = browserWindow(),
  onSent?: () => void,
): "sent" | "queued" | "dropped" {
  if (win[disableFlag] === true) return "dropped";
  const location = analyticsPageLocation(win.location.origin, win.location.pathname);
  if (!location) return "dropped";
  const event = { page_location: location, ...params };
  if (win.gtag) {
    win.gtag("event", name, event);
    onSent?.();
    return "sent";
  }
  const queue = (win.gdGaQueue = win.gdGaQueue ?? []);
  if (queue.length >= MAX_QUEUED) return "dropped";
  queue.push({ name, params: event, ...(onSent ? { onSent } : {}) });
  return "queued";
}

export type GaItem = {
  readonly item_id: string;
  readonly item_name: string;
  readonly price?: number;
  readonly quantity: number;
  readonly item_category?: string;
};

const euros = (cents: number) => Math.round(cents) / 100;

/** A catalogue item as GA4 ecommerce expects it: slug as id, unit price in euros. */
export function gaItem(input: {
  readonly slug: string;
  readonly name: string;
  readonly priceCents?: number | null;
  readonly quantity: number;
  readonly category?: string;
}): GaItem {
  return {
    item_id: input.slug,
    item_name: input.name,
    quantity: input.quantity,
    ...(input.priceCents === null || input.priceCents === undefined ? {} : { price: euros(input.priceCents) }),
    ...(input.category ? { item_category: input.category } : {}),
  };
}

/**
 * The purchase event for a paid Stripe session: value is what the goods cost after discounts
 * (total minus shipping), shipping on its own, the order reference as transaction id so a reload
 * can never count a sale twice.
 */
export function purchaseEvent(input: {
  readonly reference: string;
  readonly totalCents: number;
  readonly shippingCents: number;
  readonly items: readonly GaItem[];
}) {
  return {
    transaction_id: input.reference,
    currency: "EUR",
    value: euros(Math.max(0, input.totalCents - input.shippingCents)),
    shipping: euros(input.shippingCents),
    items: input.items,
  };
}
