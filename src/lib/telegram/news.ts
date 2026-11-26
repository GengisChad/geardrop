import type { Product, StockStatus } from "@/lib/commerce/types";

/**
 * What counts as news for the shop's Telegram channel (owner, 2026-11-26): a new arrival, a piece
 * back on the shelf, a lower price, a new tier list on /meta. Only the shop: that evening he saw a
 * draft of one of his own YouTube uploads and ruled them out ("non roba del mio youtube").
 *
 * Nothing here knows about Telegram or the database. The bot looks at the catalogue the shop itself
 * serves (stock and prices from the back office, laid over src/data/catalog.ts) and compares it with
 * what it remembered from the last look. The memory is only "what I have already seen": every figure
 * in a message is read again from the catalogue when the message is written.
 */

export const NEWS_KINDS = ["new_product", "back_in_stock", "price_drop", "channel_preorder", "meta_update"] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** What a draft needs to be written again from the shop's data at the moment it is published. */
export type NewsPayload =
  | { readonly kind: "new_product" | "back_in_stock"; readonly slugs: readonly string[] }
  /** A pre-order taken on Telegram only: the post's button opens the bot, not the shop. */
  | { readonly kind: "channel_preorder"; readonly slugs: readonly string[] }
  | { readonly kind: "price_drop"; readonly slugs: readonly string[]; readonly price: number; readonly previousPrice: number }
  | { readonly kind: "meta_update"; readonly month: string };

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
  /** A pre-order taken on Telegram only, not in the shop yet (Product.channelOnly). */
  readonly channelOnly?: true;
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
  const preorders: string[] = [];
  const drops = new Map<string, { slugs: string[]; price: number; previousPrice: number }>();
  const push = (groups: Map<string, string[]>, product: Product) => {
    const subject = subjectOf(product);
    groups.set(subject, [...(groups.get(subject) ?? []), product.slug]);
  };

  for (const product of products) {
    const before = remembered.get(product.slug);
    const price = product.price.amount;
    const onSale = sellable(product.stock);
    // Pre-ordered on the channel only, whether the shop hides it or lists it as sold out with
    // "Avvisami": its news is the pre-order on the channel, and nothing else about it is.
    const hidden = Boolean(product.channelOnly);
    const flag = hidden ? { channelOnly: true as const } : {};

    if (!before) {
      if (firstLook || onSale) {
        memory.set(product.slug, { stock: product.stock, prices: withPrice([], price, now), ...flag });
        if (!firstLook) {
          if (hidden) preorders.push(product.slug);
          else push(arrivals, product);
        }
      } else {
        memory.set(product.slug, { stock: product.stock, prices: withPrice([], price, now), unannounced: true, ...flag });
      }
      continue;
    }

    const back = !sellable(before.stock) && onSale;
    // The pieces of a Telegram pre-order reached the shelf: for the shop that is its arrival.
    const landed = before.channelOnly === true && !hidden && onSale;
    if (hidden) {
      if (back) preorders.push(product.slug);
    } else if (landed || (back && before.unannounced)) {
      push(arrivals, product);
    } else if (back && !product.bundleOf) {
      // A kit comes back because one of its pieces did: the piece is the news, not every kit it is in.
      push(returns, product);
    }

    const current = before.prices[before.prices.length - 1]?.amount;
    if (current !== undefined && price < current && onSale && !back && !hidden && !landed) {
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
    if (
      before.stock !== product.stock ||
      !samePrices(prices, before.prices) ||
      (before.unannounced === true) !== stillUnannounced ||
      (before.channelOnly === true) !== hidden
    ) {
      memory.set(product.slug, { stock: product.stock, prices, ...(stillUnannounced ? { unannounced: true as const } : {}), ...flag });
    }
  }

  const events: NewsEvent[] = [
    ...[...arrivals].map(([subject, slugs]) => ({ eventKey: `new:${subject}`, payload: { kind: "new_product" as const, slugs } })),
    ...[...returns].map(([subject, slugs]) => ({ eventKey: `stock:${subject}:${day(now)}`, payload: { kind: "back_in_stock" as const, slugs } })),
    ...preorders.map((slug) => ({ eventKey: `preorder:${slug}:${day(now)}`, payload: { kind: "channel_preorder" as const, slugs: [slug] } })),
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

export function isNewsPayload(value: unknown): value is NewsPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const slugs = Array.isArray(payload["slugs"]) && payload["slugs"].length > 0 && payload["slugs"].every((slug) => typeof slug === "string");
  switch (payload["kind"]) {
    case "new_product":
    case "back_in_stock":
    case "channel_preorder":
      return slugs;
    case "price_drop":
      return slugs && Number.isSafeInteger(payload["price"]) && Number.isSafeInteger(payload["previousPrice"]);
    case "meta_update":
      return typeof payload["month"] === "string";
    default:
      return false;
  }
}
