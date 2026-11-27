import { telegramPostImages } from "@/data/assets";
import { hiddenFromShop, shopView } from "@/lib/commerce/channel-only";
import type { Product } from "@/lib/commerce/types";
import { formatPrice } from "@/lib/format";
import { stockLabel } from "@/lib/labels";
import { absoluteUrl } from "@/lib/seo";
import { escapeTelegram, shopLink, shopProductPost, type InlineKeyboard } from "./messages";
import { restockTelegramUrl } from "./restock-link";

/**
 * Inline search (owner, 2026-11-27): in any chat, "@GearDropNewsBot dran" lists the shop's pieces
 * that match, and a tap sends the piece to that chat with its price, its availability and the
 * button to buy it. Everything comes from the catalogue the shop serves at that moment, like the
 * channel's posts; a piece kept off the shop (a Telegram-only pre-order) is never listed.
 *
 * Nothing is kept: the query and who typed it are only answered.
 */

/** One result as Telegram's answerInlineQuery takes it (InlineQueryResultArticle). */
export type InlineArticle = {
  readonly type: "article";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly thumbnail_url?: string;
  readonly input_message_content: {
    readonly message_text: string;
    readonly parse_mode: "HTML";
    readonly link_preview_options: { readonly url: string; readonly prefer_large_media: true; readonly show_above_text: true };
  };
  readonly reply_markup: { readonly inline_keyboard: InlineKeyboard };
};

/** How many pieces one answer lists: Telegram takes up to 50, a phone shows about ten. */
export const INLINE_RESULTS = 20;

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const words = (query: string) => normalise(query).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8);

function article(product: Product): InlineArticle {
  const page = shopLink(`/prodotto/${product.slug}`);
  const price = formatPrice({ amount: product.price.amount, currency: "EUR" });
  const status = stockLabel(product);
  const post = shopProductPost(product);
  const keyboard: InlineKeyboard = post.ok
    ? [[{ text: post.post.link.label, url: post.post.link.url }]]
    : [[{ text: "Avvisami su Telegram", url: restockTelegramUrl(product.slug) ?? page }], [{ text: "Vedi sul sito", url: page }]];
  const text = post.ok ? post.post.text : `<b>${escapeTelegram(product.name)}</b>\n<b>${price}</b> · ${escapeTelegram(status)}`;
  const picture = telegramPostImages[product.slug] ?? product.images[0]?.src;
  return {
    type: "article",
    id: product.slug.slice(0, 64),
    title: product.name,
    description: `${price} · ${status}`,
    ...(picture ? { thumbnail_url: absoluteUrl(picture) } : {}),
    input_message_content: { message_text: text, parse_mode: "HTML", link_preview_options: { url: page, prefer_large_media: true, show_above_text: true } },
    reply_markup: { inline_keyboard: keyboard },
  };
}

/**
 * The pieces a query finds: every word in the name, tagline or description, the ones named first,
 * then what can be bought now. An empty query lists what can be bought now.
 */
export function searchInline(query: string, catalogue: readonly Product[]): InlineArticle[] {
  const tokens = words(query);
  const shelf = catalogue.filter((product) => !hiddenFromShop(product)).map(shopView);
  const named = (product: Product) => Number(tokens.length > 0 && tokens.every((token) => normalise(product.name).includes(token)));
  const buyable = (product: Product) => Number(product.stock !== "esaurito");
  const found =
    tokens.length === 0
      ? shelf.filter((product) => buyable(product) === 1)
      : shelf.filter((product) => {
          const haystack = normalise(`${product.name} ${product.tagline} ${product.description} ${product.bladeType ?? ""}`);
          return tokens.every((token) => haystack.includes(token));
        });
  return found
    .sort((a, b) => named(b) - named(a) || buyable(b) - buyable(a) || a.name.localeCompare(b.name, "it"))
    .slice(0, INLINE_RESULTS)
    .map(article);
}
