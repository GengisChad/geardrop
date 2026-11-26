import type { Product, StockStatus } from "@/lib/commerce/types";

/**
 * What counts as news for the shop's Telegram channel (owner, 2026-11-26): a new arrival, a piece
 * back on the shelf, a lower price, a new tier list on /meta, a new video on the channel.
 *
 * Nothing here knows about Telegram or the database. The bot looks at the catalogue the shop itself
 * serves (stock and prices from the back office, laid over src/data/catalog.ts) and compares it with
 * what it remembered from the last look. The memory is only "what I have already seen": every figure
 * in a message is read again from the catalogue when the message is written.
 */

export const NEWS_KINDS = ["new_product", "back_in_stock", "price_drop", "meta_update", "new_video"] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** What a draft needs to be written again from the shop's data at the moment it is published. */
export type NewsPayload =
  | { readonly kind: "new_product" | "back_in_stock"; readonly slugs: readonly string[] }
  | { readonly kind: "price_drop"; readonly slugs: readonly string[]; readonly price: number; readonly previousPrice: number }
  | { readonly kind: "meta_update"; readonly month: string }
  | { readonly kind: "new_video"; readonly videoId: string; readonly title: string; readonly url: string };

export type NewsEvent = {
  /** The same event found twice has the same key, so it is drafted once. */
  readonly eventKey: string;
  readonly payload: NewsPayload;
};

/** One price a product sold at, and the day the bot first saw it. */
export type SeenPrice = { readonly amount: number; readonly since: string };

/** What the bot remembers of one product between two looks at the catalogue. */
export type ProductMemory = {
  readonly stock: StockStatus;
  /** Oldest first; the last one is the current price. */
  readonly prices: readonly SeenPrice[];
  /** Entered the catalogue sold out: its first day on the shelf is an arrival, not a return. */
  readonly unannounced?: true;
};

const DAY_MS = 86_400_000;
/**
 * A lower price is announced against the lowest price of the 30 days before it, as the Codice del
 * consumo asks of any announced reduction (art. 17-bis). A price that only comes back down after a
 * rise inside those 30 days is therefore not announced as a reduction.
 */
export const PRICE_REFERENCE_DAYS = 30;

const sellable = (stock: StockStatus) => stock !== "esaurito";

/** The colours of one item are one piece of news, not one each. */
function subjectOf(product: Product): string {
  return product.variant?.family ?? product.slug;
}

function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The lowest price in force at any time in the 30 days before `now`. */
export function referencePrice(prices: readonly SeenPrice[], now: Date): number | undefined {
  const from = now.getTime() - PRICE_REFERENCE_DAYS * DAY_MS;
  const inForce = prices.filter((_, index) => {
    const until = prices[index + 1]?.since;
    return until === undefined || Date.parse(until) > from;
  });
  return inForce.length > 0 ? Math.min(...inForce.map((price) => price.amount)) : undefined;
}

/** The history with today's price on the end, and without what stopped mattering over 30 days ago. */
function withPrice(prices: readonly SeenPrice[], amount: number, now: Date): readonly SeenPrice[] {
  const last = prices[prices.length - 1];
  const next = last?.amount === amount ? prices : [...prices, { amount, since: now.toISOString() }];
  const from = now.getTime() - PRICE_REFERENCE_DAYS * DAY_MS;
  return next.filter((_, index) => {
    const until = next[index + 1]?.since;
    return until === undefined || Date.parse(until) > from;
  });
}

function samePrices(a: readonly SeenPrice[], b: readonly SeenPrice[]): boolean {
  return a.length === b.length && a.every((price, index) => price.amount === b[index]!.amount && price.since === b[index]!.since);
}

export function isProductMemory(value: unknown): value is ProductMemory {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { stock?: unknown; prices?: unknown };
  return (
    typeof candidate.stock === "string" &&
    Array.isArray(candidate.prices) &&
    candidate.prices.every(
      (price: unknown) =>
        typeof price === "object" &&
        price !== null &&
        Number.isSafeInteger((price as SeenPrice).amount) &&
        typeof (price as SeenPrice).since === "string",
    )
  );
}

export type ProductScan = {
  readonly events: readonly NewsEvent[];
  /** Only the products whose memory changed. */
  readonly memory: ReadonlyMap<string, ProductMemory>;
};

/**
 * Compares the catalogue with the bot's memory of it.
 *
 * `firstLook` is the very first run: everything on sale is simply remembered, because a channel
 * that opens by announcing forty "new arrivals" would be lying about every one of them.
 */
export function scanProducts(
  remembered: ReadonlyMap<string, ProductMemory>,
  products: readonly Product[],
  now: Date,
  firstLook = false,
): ProductScan {
  const memory = new Map<string, ProductMemory>();
  const arrivals = new Map<string, string[]>();
  const returns = new Map<string, string[]>();
  const drops = new Map<string, { slugs: string[]; price: number; previousPrice: number }>();
  const push = (groups: Map<string, string[]>, product: Product) => {
    const subject = subjectOf(product);
    groups.set(subject, [...(groups.get(subject) ?? []), product.slug]);
  };

  for (const product of products) {
    const before = remembered.get(product.slug);
    const price = product.price.amount;
    const onSale = sellable(product.stock);

    if (!before) {
      if (firstLook || onSale) {
        memory.set(product.slug, { stock: product.stock, prices: withPrice([], price, now) });
        if (!firstLook) push(arrivals, product);
      } else {
        memory.set(product.slug, { stock: product.stock, prices: withPrice([], price, now), unannounced: true });
      }
      continue;
    }

    const back = !sellable(before.stock) && onSale;
    if (back) {
      if (before.unannounced) push(arrivals, product);
      // A kit comes back because one of its pieces did: the piece is the news, not every kit it is in.
      else if (!product.bundleOf) push(returns, product);
    }

    const current = before.prices[before.prices.length - 1]?.amount;
    if (current !== undefined && price < current && onSale && !back) {
      const reference = referencePrice(before.prices, now);
      if (reference !== undefined && price < reference) {
        const subject = subjectOf(product);
        const group = drops.get(subject);
        // Colours of one item share a price; if they ever differ the message shows the cheapest.
        if (group) drops.set(subject, { slugs: [...group.slugs, product.slug], price: Math.min(group.price, price), previousPrice: Math.max(group.previousPrice, reference) });
        else drops.set(subject, { slugs: [product.slug], price, previousPrice: reference });
      }
    }

    const prices = withPrice(before.prices, price, now);
    const stillUnannounced = before.unannounced === true && !onSale;
    if (before.stock !== product.stock || !samePrices(prices, before.prices) || (before.unannounced === true) !== stillUnannounced) {
      memory.set(product.slug, { stock: product.stock, prices, ...(stillUnannounced ? { unannounced: true as const } : {}) });
    }
  }

  const events: NewsEvent[] = [
    ...[...arrivals].map(([subject, slugs]) => ({ eventKey: `new:${subject}`, payload: { kind: "new_product" as const, slugs } })),
    ...[...returns].map(([subject, slugs]) => ({ eventKey: `stock:${subject}:${day(now)}`, payload: { kind: "back_in_stock" as const, slugs } })),
    ...[...drops].map(([subject, drop]) => ({
      eventKey: `price:${subject}:${drop.price}:${day(now)}`,
      payload: { kind: "price_drop" as const, slugs: drop.slugs, price: drop.price, previousPrice: drop.previousPrice },
    })),
  ];
  return { events, memory };
}

/**
 * A tier list is news the first time its month is published. Several unseen months at once (an
 * archive filled in one go) announce only the newest.
 */
export function scanMeta(seenMonths: ReadonlySet<string>, publishedMonths: readonly string[], firstLook = false): { readonly events: readonly NewsEvent[]; readonly seen: readonly string[] } {
  const unseen = publishedMonths.filter((month) => !seenMonths.has(month));
  if (firstLook || unseen.length === 0) return { events: [], seen: unseen };
  const newest = [...unseen].sort().at(-1)!;
  const latestKnown = [...seenMonths].sort().at(-1);
  // A month older than one already seen is the archive being completed, not news.
  const events = latestKnown === undefined || newest > latestKnown ? [{ eventKey: `meta:${newest}`, payload: { kind: "meta_update" as const, month: newest } }] : [];
  return { events, seen: unseen };
}

export type ChannelVideo = { readonly id: string; readonly title: string; readonly url: string; readonly publishedAt: string };

/** How many unseen uploads one look may announce: a feed read after a long silence is not news. */
const MAX_VIDEOS_PER_SCAN = 3;

export function scanVideos(seenIds: ReadonlySet<string>, videos: readonly ChannelVideo[], firstLook = false): { readonly events: readonly NewsEvent[]; readonly seen: readonly string[] } {
  const unseen = videos.filter((video) => !seenIds.has(video.id));
  if (firstLook) return { events: [], seen: unseen.map((video) => video.id) };
  const newest = [...unseen].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)).slice(-MAX_VIDEOS_PER_SCAN);
  return {
    events: newest.map((video) => ({ eventKey: `video:${video.id}`, payload: { kind: "new_video" as const, videoId: video.id, title: video.title, url: video.url } })),
    seen: unseen.map((video) => video.id),
  };
}

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The uploads in a channel's public Atom feed (youtube.com/feeds/videos.xml), which needs no key. */
export function parseYoutubeFeed(xml: string): readonly ChannelVideo[] {
  const videos: ChannelVideo[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = /<yt:videoId>([A-Za-z0-9_-]{6,20})<\/yt:videoId>/.exec(entry!)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry!)?.[1];
    const publishedAt = /<published>([^<]+)<\/published>/.exec(entry!)?.[1];
    if (!id || !title || !publishedAt) continue;
    videos.push({ id, title: decodeXml(title).trim(), url: `https://www.youtube.com/watch?v=${id}`, publishedAt });
  }
  return videos;
}

export function isNewsPayload(value: unknown): value is NewsPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const slugs = Array.isArray(payload["slugs"]) && payload["slugs"].length > 0 && payload["slugs"].every((slug) => typeof slug === "string");
  switch (payload["kind"]) {
    case "new_product":
    case "back_in_stock":
      return slugs;
    case "price_drop":
      return slugs && Number.isSafeInteger(payload["price"]) && Number.isSafeInteger(payload["previousPrice"]);
    case "meta_update":
      return typeof payload["month"] === "string";
    case "new_video":
      return typeof payload["videoId"] === "string" && typeof payload["title"] === "string" && typeof payload["url"] === "string";
    default:
      return false;
  }
}
