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

/**
 * Query parameters that say where a visit came from. Analytics reads a session's source from the
 * address of its first page view, so a landing page stripped of these turns every campaign, every
 * tagged bio link and every paid click into "Direct" or "Unassigned".
 *
 * The utm_* tags are labels a link carries for everyone who follows it; they say nothing about the
 * visitor. Click identifiers are per visitor, so they only pass with marketing consent — the same
 * consent that lets Google Ads count the sale they lead to.
 */
const CAMPAIGN_PARAMS: readonly string[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
];
const CLICK_ID_PARAMS: readonly string[] = ["gclid", "gbraid", "wbraid", "gclsrc", "dclid", "srsltid"];

/**
 * The page address Analytics may see: nothing on an account or auth route, no hash, and of the
 * query string only the attribution parameters above — never a Stripe session id, a search term
 * or anything else a URL can carry.
 */
export function analyticsPageLocation(
  origin: string,
  pathname: string,
  search = "",
  { clickIds = false }: { readonly clickIds?: boolean } = {},
): string | null {
  if (!FUNNEL_PATHS.has(pathname) && isSensitiveAnalyticsPath(pathname)) return null;
  const query = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const name of clickIds ? [...CAMPAIGN_PARAMS, ...CLICK_ID_PARAMS] : CAMPAIGN_PARAMS) {
    const value = query.get(name);
    if (value) kept.set(name, value);
  }
  const tail = kept.toString();
  return `${origin}${pathname}${tail ? `?${tail}` : ""}`;
}

type QueuedEvent = { readonly name: string; readonly params: Record<string, unknown>; readonly onSent?: () => void };
type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  gdGaQueue?: QueuedEvent[];
  /** Marketing granted on the running tag: click identifiers may ride on the page address. */
  gdGaAdSignals?: boolean;
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
  win.gdGaAdSignals = purposes.marketing;
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
  // Queued events are not sent here but after the first page view (see sendPageView): a session
  // takes its source from its first event, and a view_item raised by the product page before the
  // banner was read carries no campaign — sent first, it made the session "Unassigned".
}

/** Withdrawn consent: the loaded tag stops sending, queued events are dropped, and the cookies go. */
export function disableGoogleAnalytics(cookieNames: readonly string[], win: GtagWindow = browserWindow()): void {
  win[disableFlag] = true;
  win.gdGaQueue = [];
  win.gdGaAdSignals = false;
  win.gtag?.("consent", "update", consentState({ analytics: false, marketing: false }));
  disableCookies(cookieNames, win);
}

/** Marketing withdrawn while statistics stay: the ad signals go back to denied. */
export function denyMarketing(cookieNames: readonly string[], win: GtagWindow = browserWindow()): void {
  win.gdGaAdSignals = false;
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

/**
 * One page view, for a path Analytics may see, carrying the landing page's campaign parameters.
 * Then whatever was raised before the visitor's choice was read goes out behind it, so the page
 * view stays the session's first event.
 */
export function sendPageView(pathname: string, win: GtagWindow = browserWindow()): boolean {
  if (!win.gtag || win[disableFlag] === true) return false;
  const location = analyticsPageLocation(win.location.origin, pathname, win.location.search ?? "", {
    clickIds: win.gdGaAdSignals === true,
  });
  if (location) win.gtag("event", "page_view", { page_location: location, page_title: win.document.title });
  for (const event of win.gdGaQueue?.splice(0) ?? []) {
    win.gtag("event", event.name, event.params);
    event.onSent?.();
  }
  return location !== null;
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
