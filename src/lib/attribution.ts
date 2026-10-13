import { z } from "zod";

/**
 * Where an order came from: the channel of the visit that ended in the purchase.
 *
 * Analytics only hears from buyers who accept statistics cookies, which on this shop is about
 * one order in eight, so neither GA4 nor Google Ads can say whether a campaign sold anything.
 * The order itself can: the browser notes the channel when a visit lands, the checkout carries
 * it to Stripe, and the webhook writes it next to the order.
 *
 * Only coarse labels are kept — "google / cpc", "instagram / social", "direct" — never a click
 * identifier, a full URL or anything that could single out a person. Nothing is sent anywhere
 * but to our own order.
 */
export type VisitSource = {
  readonly source: string;
  readonly medium: string;
  readonly campaign?: string | undefined;
  /** Path of the page the visit landed on, without query string. */
  readonly landing?: string | undefined;
};

export const DIRECT: VisitSource = { source: "direct", medium: "none" };

/** One sessionStorage entry, so the channel survives the walk from product page to checkout. */
export const ATTRIBUTION_STORAGE_KEY = "gd-visit-source";

const LABEL = /^[a-z0-9._ -]+$/;

/** Lower-cased, trimmed and bounded, or nothing at all: a label is never allowed to carry free text. */
function label(value: string | null | undefined, max: number): string | undefined {
  const clean = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, max);
  return clean && LABEL.test(clean) ? clean : undefined;
}

function landingPath(pathname: string | null | undefined): string | undefined {
  const path = (pathname ?? "").split(/[?#]/)[0]!.slice(0, 120);
  return /^\/[a-z0-9/_-]*$/i.test(path) ? path : undefined;
}

/** Click identifiers that mean "a paid Google click"; their values are read, never stored. */
const GOOGLE_ADS_CLICK_IDS = ["gclid", "gbraid", "wbraid", "dclid"] as const;

const SEARCH_ENGINES: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)search\.yahoo\.com$/, "yahoo"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
];

const SOCIAL: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|^t\.co$/, "x"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, "whatsapp"],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, "telegram"],
];

function referrerHost(referrer: string | null | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * The channel of a visit, from what the landing page can see: its query string, the referrer
 * and its own host. In order of precedence:
 *
 * 1. utm_* tags, which whoever wrote the link chose on purpose (a bio link, a newsletter);
 * 2. a Google Ads click identifier: "google / cpc";
 * 3. srsltid, which Merchant Center appends to its free listings and organic results;
 * 4. the referrer's host: a search engine is organic, a social network is social, anything
 *    else is a referral;
 * 5. nothing at all: direct.
 *
 * A referrer from our own host or from Stripe's checkout is not a new visit.
 */
export function deriveVisitSource(input: {
  readonly search: string;
  readonly referrer: string;
  readonly host: string;
  readonly pathname: string;
}): VisitSource {
  const query = new URLSearchParams(input.search);
  const landing = landingPath(input.pathname);
  const withLanding = (source: VisitSource): VisitSource => (landing ? { ...source, landing } : source);

  const utmSource = label(query.get("utm_source"), 40);
  if (utmSource) {
    const campaign = label(query.get("utm_campaign"), 60);
    return withLanding({
      source: utmSource,
      medium: label(query.get("utm_medium"), 40) ?? "none",
      ...(campaign ? { campaign } : {}),
    });
  }

  if (GOOGLE_ADS_CLICK_IDS.some((name) => query.get(name))) return withLanding({ source: "google", medium: "cpc" });
  if (query.get("srsltid")) return withLanding({ source: "google", medium: "free" });

  const host = referrerHost(input.referrer);
  const ownHost = input.host.toLowerCase().replace(/^www\./, "");
  if (host && host !== ownHost && !host.endsWith("stripe.com")) {
    const engine = SEARCH_ENGINES.find(([pattern]) => pattern.test(host));
    if (engine) return withLanding({ source: engine[1], medium: "organic" });
    const social = SOCIAL.find(([pattern]) => pattern.test(host));
    if (social) return withLanding({ source: social[1], medium: "social" });
    const referral = label(host, 40);
    if (referral) return withLanding({ source: referral, medium: "referral" });
  }

  // Instagram's in-app browser drops the referrer and appends fbclid instead.
  if (query.get("fbclid")) return withLanding({ source: "instagram-facebook", medium: "social" });

  return withLanding(DIRECT);
}

/**
 * The rule for a visit that already has a channel: a new landing with a real channel replaces
 * it (the last non-direct click wins), a direct one never does — reloading a page or opening a
 * bookmark mid-visit does not erase the ad that brought the buyer.
 */
export function nextVisitSource(stored: VisitSource | null, landed: VisitSource): VisitSource {
  if (!stored) return landed;
  return landed.source === DIRECT.source ? stored : landed;
}

/**
 * What the server accepts from the browser. An attribution that fails validation is dropped,
 * never an error: a malformed label must not cost a sale.
 */
export const visitSourceSchema = z
  .object({
    source: z.string().regex(LABEL).max(40),
    medium: z.string().regex(LABEL).max(40),
    campaign: z.string().regex(LABEL).max(60).optional(),
    landing: z.string().regex(/^\/[a-z0-9/_-]*$/i).max(120).optional(),
  })
  .optional()
  .catch(undefined);

/** The same guard for anything read back (Stripe metadata, storage): a VisitSource or null. */
export function parseVisitSource(value: unknown): VisitSource | null {
  const parsed = visitSourceSchema.parse(value);
  return parsed ?? null;
}

/** How the admin reads a channel. */
export function visitSourceLabel(source: Pick<VisitSource, "source" | "medium" | "campaign"> | null): string {
  if (!source) return "Non registrata";
  const key = `${source.source} / ${source.medium}`;
  const known: Record<string, string> = {
    "google / cpc": "Google Ads",
    "google / free": "Google gratuito (Shopping o ricerca)",
    "google / organic": "Ricerca Google",
    "instagram / social": "Instagram",
    "instagram-facebook / social": "Instagram o Facebook",
    "facebook / social": "Facebook",
    "youtube / social": "YouTube",
    "tiktok / social": "TikTok",
    "direct / none": "Diretto (link salvato, digitato o app senza referrer)",
  };
  const name = known[key] ?? key;
  return source.campaign ? `${name} · ${source.campaign}` : name;
}

type StorageWindow = Pick<Window, "location" | "document" | "sessionStorage">;

/** The channel noted for this visit, or null when there is none or storage is unavailable. */
export function readVisitSource(win: StorageWindow = window): VisitSource | null {
  try {
    const raw = win.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return raw ? parseVisitSource(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Notes the channel of the page that was just loaded. Called once per full page load: a
 * client-side navigation keeps the query string of the landing page out of reach anyway.
 * Private browsing modes can refuse sessionStorage; the purchase then goes through without a
 * channel rather than failing.
 */
export function recordVisitSource(win: StorageWindow = window): VisitSource | null {
  const landed = deriveVisitSource({
    search: win.location.search,
    referrer: win.document.referrer,
    host: win.location.hostname,
    pathname: win.location.pathname,
  });
  const next = nextVisitSource(readVisitSource(win), landed);
  try {
    win.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return null;
  }
  return next;
}

/** The checkout payload's attribution field: present only when this visit has a channel. */
export function visitSourceForCheckout(win?: StorageWindow): { attribution?: VisitSource } {
  const visit = typeof window === "undefined" && !win ? null : readVisitSource(win);
  return visit ? { attribution: visit } : {};
}
