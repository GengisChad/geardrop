import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "./api";
import { escapeTelegram, shopLink, shopProductPost, type InlineKeyboard } from "./messages";
import { piecesOffered, preorderOpen, startPayload } from "./preorder-rules";
import { TELEGRAM_BOT_URL } from "./restock-link";
export { restockStartPayload } from "./restock-link";

/*
 * The waiting list (owner, 2026-11-28): the same request also waits for a piece of a Telegram-only
 * pre-order. When a reservation expires unpaid, or the owner sets more pieces aside, the chats in the
 * list hear it privately, before anyone reads it on the channel, with a «Pre-ordina» button. The
 * owner is told how many were told, so he can give them a head start before publishing.
 */

/**
 * «Avvisami» on Telegram (owner, 2026-11-27). The page of a sold-out or arriving product has a button
 * that opens the bot with "/start av-<slug>"; the bot keeps the chat in the shop's own «Avvisami»
 * list (restock_requests, next to the email requests) and, as soon as the piece can be bought on the
 * site, sends it one private message with the price and a «Compra» button, then forgets the chat.
 *
 * A message the customer asked for may go out alone, like the email notices. Nothing here posts on
 * the channel.
 */

export type RestockRequest = { readonly id: number; readonly chatId: string; readonly slug: string };

export type RestockStore = {
  /** Keeps the chat for this product, once: answers the request's id. */
  add(chatId: string, slug: string): Promise<number>;
  /** Drops this chat's request; false when it was not there. */
  remove(id: number, chatId: string): Promise<boolean>;
  /** The Telegram requests still waiting, oldest first. */
  pending(): Promise<readonly RestockRequest[]>;
  /** Drops requests once their message went out. */
  done(ids: readonly number[]): Promise<void>;
  /** Drops requests older than `before`, answered or not: what the privacy notice promises. */
  purge(before: Date): Promise<number>;
};

export type RestockContext = {
  readonly telegram: TelegramGateway;
  readonly loadProducts: () => Promise<readonly Product[]>;
  readonly now: () => Date;
  readonly store: RestockStore;
  /** The public channel's @name, for a product whose pre-order is taken there. */
  readonly channelId: string | null;
  /** The owner's chat: told how many people in the list heard of a piece. Without it, nobody is. */
  readonly ownerChatId?: string;
};

/** How long a request waits at most, as for the email ones: six months. */
export const RESTOCK_KEEP_DAYS = 183;

const ACTION = /^gd:a:x:(\d{1,12})$/;

export function slugFromRestockStart(text: string): string | null {
  return /^\/start av-([a-z0-9-]{1,61})$/.exec(text.trim())?.[1] ?? null;
}

export function parseRestockAction(data: string | undefined): { readonly id: number } | null {
  const match = ACTION.exec(data ?? "");
  return match ? { id: Number(match[1]) } : null;
}

/** Can the shop's own checkout sell it now? A Telegram-only pre-order is not on the shop yet. */
export function buyableOnShop(product: Product): boolean {
  return product.stock !== "esaurito" && !product.channelOnly;
}

function buyButton(product: Product): InlineKeyboard {
  return [[{ text: "Compra", url: shopLink(`/carrello?aggiungi=${product.slug}`) }]];
}

/** A Telegram-only pre-order with a piece someone can take right now. */
export function openOnChannel(product: Product): boolean {
  return preorderOpen(product) && piecesOffered(product) > 0;
}

/** The bot's own pre-order, opened for this product, as the channel post's button opens it. */
function preorderButton(product: Product): InlineKeyboard {
  const payload = startPayload(product.slug);
  return payload ? [[{ text: "Pre-ordina", url: `${TELEGRAM_BOT_URL}?start=${payload}` }]] : [];
}

/** "/start av-<slug>": the chat asks to be told when the piece can be bought. */
export async function startRestock(context: RestockContext, chatId: string, slug: string): Promise<string> {
  const product = (await context.loadProducts()).find((candidate) => candidate.slug === slug);
  if (!product) {
    await context.telegram.sendText(chatId, "Questo prodotto non è più nel catalogo.");
    return "restock";
  }
  const name = escapeTelegram(product.name);
  if (buyableOnShop(product)) {
    await context.telegram.sendText(chatId, `<b>${name}</b> si può già ordinare sul sito.`, buyButton(product));
    return "restock";
  }
  if (openOnChannel(product)) {
    await context.telegram.sendText(chatId, `<b>${name}</b> ha ancora pezzi in pre-ordine qui su Telegram.`, preorderButton(product));
    return "restock";
  }
  const id = await context.store.add(chatId, slug);
  const stop: InlineKeyboard = [[{ text: "Non avvisarmi più", callback_data: `gd:a:x:${id}` }]];
  if (product.channelOnly) {
    await context.telegram.sendText(chatId, `Fatto: sei in lista per <b>${name}</b>. Ti scrivo qui appena si libera un pezzo in pre-ordine, o quando si può ordinare sul sito.`, stop);
    return "restock";
  }
  await context.telegram.sendText(chatId, `Fatto: ti scrivo qui appena <b>${name}</b> si può ordinare sul sito.`, stop);
  return "restock";
}

/** "Non avvisarmi più": only the chat that asked can drop its request. */
export async function restockTap(context: RestockContext, tap: { readonly from: string; readonly data: string | undefined }): Promise<string | null> {
  const parsed = parseRestockAction(tap.data);
  if (!parsed) return null;
  return (await context.store.remove(parsed.id, tap.from)) ? "Avviso tolto." : "Avviso già tolto.";
}

/**
 * Tells every waiting chat whose piece can now be bought, once, and forgets it. `products` is the
 * catalogue the shop sells right now (read fresh by the bot's look at the shop). A message Telegram
 * refuses (the chat blocked the bot) still ends the request: there is nobody left to tell.
 */
export async function notifyRestocks(context: RestockContext, products: readonly Product[]): Promise<number> {
  await context.store.purge(new Date(context.now().getTime() - RESTOCK_KEEP_DAYS * 86_400_000));
  const waiting = await context.store.pending();
  if (waiting.length === 0) return 0;
  const bySlug = new Map(products.map((product) => [product.slug as string, product]));
  const sent: number[] = [];
  const told = new Map<string, { readonly name: string; count: number; readonly where: "sito" | "Telegram" }>();
  for (const request of waiting) {
    const product = bySlug.get(request.slug);
    if (!product) continue;
    if (buyableOnShop(product)) {
      const post = shopProductPost(product);
      const text = post.ok ? `DI NUOVO DISPONIBILE //\n${post.post.text}` : `<b>${escapeTelegram(product.name)}</b> si può di nuovo ordinare.`;
      await context.telegram.sendText(request.chatId, text, buyButton(product));
    } else if (openOnChannel(product)) {
      // The waiting list of a Telegram-only pre-order: a piece came free, and they hear it first.
      const left = product.availableQuantity === undefined ? "" : ` (${product.availableQuantity === 1 ? "1 pezzo" : `${product.availableQuantity} pezzi`})`;
      await context.telegram.sendText(request.chatId, `SI È LIBERATO UN PEZZO //\n<b>${escapeTelegram(product.name)}</b> si può di nuovo pre-ordinare${left}. Sei in lista: lo sai prima del canale.`, preorderButton(product));
    } else {
      continue;
    }
    sent.push(request.id);
    const entry = told.get(product.slug) ?? { name: product.name, count: 0, where: buyableOnShop(product) ? "sito" : "Telegram" };
    entry.count += 1;
    told.set(product.slug, entry);
  }
  if (sent.length > 0) await context.store.done(sent);
  if (context.ownerChatId && told.size > 0) {
    const lines = [...told.values()].map((entry) => `${entry.count} ${entry.count === 1 ? "persona" : "persone"} per <b>${escapeTelegram(entry.name)}</b> (${entry.where})`);
    await context.telegram.sendText(
      context.ownerChatId,
      `<b>LISTA D'ATTESA //</b>\nAvvisate adesso in privato: ${lines.join(", ")}.\nSe vuoi dar loro un vantaggio, pubblica il post sul canale più tardi.`,
    );
  }
  return sent.length;
}
