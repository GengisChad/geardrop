import type { Product } from "@/lib/commerce/types";
import { discountPercent, formatPrice } from "@/lib/format";
import { bundleNoun, preorderDelivery, stockHint, stockLabel } from "@/lib/labels";
import { monthLabel } from "@/lib/meta/types";
import { absoluteUrl } from "@/lib/seo";
import type { NewsPayload } from "./news";
import { startPayload } from "./preorder-rules";

/**
 * The words of the channel's posts.
 *
 * Every figure comes from the product the shop serves at the moment the post is written: the price
 * through formatPrice, the availability through the same labels the product page prints. Nothing is
 * typed by hand, so a post can never say a price or a stock the shop does not have. A draft that is
 * no longer true when the owner taps "Pubblica" (the piece sold out again, the price went back up)
 * is refused instead of published.
 *
 * Text is Telegram's HTML: <b>, <s>, <i> only, everything else escaped.
 */

export type TelegramPost = {
  readonly text: string;
  /** The packshot, when the post is about one item. */
  readonly photoUrl?: string;
  /** The one place the post sends the reader. */
  readonly link: { readonly label: string; readonly url: string };
};

export type PostResult = { readonly ok: true; readonly post: TelegramPost } | { readonly ok: false; readonly reason: string };

export function escapeTelegram(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A shop address tagged for the order attribution (src/lib/attribution.ts), so an order that came
 * from the channel says so: Telegram's in-app browser sends no referrer.
 */
export function shopLink(path: string): string {
  const url = new URL(absoluteUrl(path));
  url.searchParams.set("utm_source", "telegram");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "news");
  return url.toString();
}

/** "€18,90 invece di €21,90 (-14%)", or the price alone when nothing is struck through. */
function priceLine(price: number, was: number | undefined, from = false): string {
  const now = `<b>${from ? "da " : ""}${formatPrice({ amount: price, currency: "EUR" })}</b>`;
  if (was === undefined || was <= price) return now;
  const full = { amount: was, currency: "EUR" as const };
  return `${now} invece di <s>${formatPrice(full)}</s> (-${discountPercent({ amount: price, currency: "EUR" }, full)}%)`;
}

const HEADLINE = {
  new_product: { disponibile: "NUOVO ARRIVO", "in-arrivo": "NUOVO, IN ARRIVO", "pre-ordine": "NUOVO IN PRE-ORDINE" },
  back_in_stock: { disponibile: "DI NUOVO DISPONIBILE", "in-arrivo": "DI NUOVO IN ARRIVO", "pre-ordine": "PRE-ORDINI RIAPERTI" },
} as const;

type ProductPayload = Extract<NewsPayload, { readonly kind: "new_product" | "back_in_stock" | "price_drop" }>;

/**
 * The post for a product, or for the colours of one item, from the catalogue as it is now.
 * `catalogue` is whatever the shop serves; the payload only says which slugs the news is about.
 */
export function productPost(payload: ProductPayload, catalogue: readonly Product[]): PostResult {
  const named = payload.slugs.flatMap((slug) => catalogue.filter((product) => product.slug === slug));
  if (named.length === 0) return { ok: false, reason: "il prodotto non è più a catalogo" };
  // A Telegram-only pre-order has no place in the shop to send the reader to.
  if (named.every((product) => product.channelOnly)) return { ok: false, reason: `${named[0]!.name} non è ancora in vendita sul sito` };
  const onSale = named.filter((product) => product.stock !== "esaurito" && !product.channelOnly);
  const first = onSale[0];
  if (!first) return { ok: false, reason: `${named[0]!.variant?.familyName ?? named[0]!.name} è di nuovo esaurito` };

  const stock = first.stock as Exclude<Product["stock"], "esaurito">;
  const price = Math.min(...onSale.map((product) => product.price.amount));
  const samePrice = onSale.every((product) => product.price.amount === price);
  const cheapest = onSale.find((product) => product.price.amount === price)!;
  const name = onSale.length > 1 && first.variant ? first.variant.familyName : first.name;

  let headline: string;
  let was = samePrice ? cheapest.compareAtPrice?.amount : undefined;
  if (payload.kind === "price_drop") {
    if (price > payload.price) return { ok: false, reason: `il prezzo di ${name} è risalito` };
    headline = "PREZZO RIBASSATO";
    // The struck-through price the shop itself shows wins; without one, the lowest of the 30 days before.
    was ??= payload.previousPrice;
    if (was <= price) return { ok: false, reason: `${name} non costa meno di prima` };
  } else {
    headline = payload.kind === "new_product" && first.bundleOf ? `NUOVO ${bundleNoun(first).toUpperCase()}` : HEADLINE[payload.kind][stock];
  }

  const lines = [`${headline} //`, `<b>${escapeTelegram(name)}</b>`];
  if (onSale.length > 1 && first.variant) lines.push(`Colori: ${onSale.map((product) => escapeTelegram(product.variant?.label ?? product.name)).join(", ")}`);
  lines.push(`${priceLine(price, was, !samePrice)} · ${stockLabel(first)}`);
  // A piece that does not ship now says how long it takes, in the product page's own words.
  if (stock !== "disponibile") lines.push(escapeTelegram(stockHint(first)));

  const image = first.images[0];
  return {
    ok: true,
    post: {
      text: lines.join("\n"),
      ...(image ? { photoUrl: absoluteUrl(image.src) } : {}),
      link: { label: "Vedi nello shop", url: shopLink(`/prodotto/${first.slug}`) },
    },
  };
}

/**
 * The post that opens a pre-order taken on Telegram only: the piece is not in the shop yet, so the
 * one button opens the bot, which takes the reservation and the payment (see preorders.ts).
 */
export function channelPreorderPost(payload: { readonly slugs: readonly string[] }, catalogue: readonly Product[], botUsername: string): PostResult {
  const product = catalogue.find((candidate) => candidate.slug === payload.slugs[0]);
  if (!product) return { ok: false, reason: "il prodotto non è più a catalogo" };
  if (!product.channelOnly) return { ok: false, reason: `${product.name} è già in vendita sul sito` };
  if (product.stock === "esaurito") return { ok: false, reason: `i pezzi di ${product.name} sono finiti` };
  const start = startPayload(product.slug);
  if (!start) return { ok: false, reason: `il codice di ${product.name} è troppo lungo per il tasto di Telegram` };

  const left = product.availableQuantity;
  const lines = [
    "PRE-ORDINE // solo sul canale",
    `<b>${escapeTelegram(product.name)}</b>`,
    `<b>${formatPrice(product.price)}</b>${left === undefined ? "" : ` · ${left === 1 ? "1 pezzo" : `${left} pezzi`}`}`,
    escapeTelegram(preorderDelivery(product.releasePreorder)),
    "Si prenota e si paga qui. Sul sito arriva quando è in magazzino.",
  ];
  const image = product.images[0];
  return {
    ok: true,
    post: {
      text: lines.join("\n"),
      ...(image ? { photoUrl: absoluteUrl(image.src) } : {}),
      link: { label: "Pre-ordina", url: `https://t.me/${botUsername}?start=${start}` },
    },
  };
}

export type MetaSummary = { readonly month: string; readonly title: string; readonly topBlades: readonly string[] };

/** The tier list's month and its first three blades. Where the figures come from is never named. */
export function metaPost(meta: MetaSummary): TelegramPost {
  const lines = [`META // ${escapeTelegram(monthLabel(meta.month))}`, `<b>${escapeTelegram(meta.title)}</b>`];
  const top = meta.topBlades.slice(0, 3);
  if (top.length > 0) lines.push(`Top blade: ${top.map((blade, index) => `${index + 1}. ${escapeTelegram(blade)}`).join(" · ")}`);
  return { text: lines.join("\n"), link: { label: "Apri la tier list", url: shopLink(`/meta/${meta.month}`) } };
}

export function videoPost(video: { readonly title: string; readonly url: string }): TelegramPost {
  return {
    text: `NUOVO VIDEO // @GengisChad\n<b>${escapeTelegram(video.title)}</b>`,
    link: { label: "Guarda su YouTube", url: video.url },
  };
}

export type InlineButton = { readonly text: string; readonly url: string } | { readonly text: string; readonly callback_data: string };
export type InlineKeyboard = readonly (readonly InlineButton[])[];

export const PUBLISH_ACTION = "gd:p:";
export const DISCARD_ACTION = "gd:x:";

/** The post as the channel will show it: one button, to the shop. */
export function postKeyboard(post: TelegramPost): InlineKeyboard {
  return [[{ text: post.link.label, url: post.link.url }]];
}

/** The same post in the owner's chat, with the two answers above the channel's button. */
export function draftKeyboard(draftId: number, post: TelegramPost): InlineKeyboard {
  return [
    [
      { text: "Pubblica", callback_data: `${PUBLISH_ACTION}${draftId}` },
      { text: "Scarta", callback_data: `${DISCARD_ACTION}${draftId}` },
    ],
    ...postKeyboard(post),
  ];
}

/** What the owner reads above a draft, so a preview is never mistaken for a published post. */
export function asDraft(post: TelegramPost, destination: string): TelegramPost {
  return { ...post, text: `<i>Bozza per ${escapeTelegram(destination)}: esce solo se tocchi Pubblica.</i>\n\n${post.text}` };
}

/** `gd:p:12` → publish draft 12. Anything else is not one of the bot's buttons. */
export function parseDraftAction(data: string | undefined): { readonly action: "publish" | "discard"; readonly draftId: number } | null {
  const match = /^gd:([px]):(\d{1,12})$/.exec(data ?? "");
  if (!match) return null;
  return { action: match[1] === "p" ? "publish" : "discard", draftId: Number(match[2]) };
}
