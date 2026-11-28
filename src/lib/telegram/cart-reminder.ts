import { createHmac, timingSafeEqual } from "node:crypto";
import type { Product } from "@/lib/commerce/types";
import { formatPrice } from "@/lib/format";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { TELEGRAM_CART_PARAM, TELEGRAM_CART_TOKEN } from "@/lib/telegram-cart";
import type { TelegramGateway } from "./api";
import { escapeTelegram, shopLink, type InlineButton, type InlineKeyboard } from "./messages";
import { CART_LINK_PIECES } from "./preorder-rules";
import { buyableOnShop } from "./restock";

/**
 * «Hai lasciato qualcosa nel carrello» (owner, 2026-11-28), for carts opened from the bot only.
 *
 * Every cart link the bot sends in a private chat carries that chat, signed with the server's
 * TELEGRAM_WEBHOOK_SECRET (cartTokenGateway below). The checkout checks the signature and puts the
 * chat on the Stripe session (metadata telegram_chat). Each morning the bot reads the sessions of the
 * day before: a chat whose session expired unpaid, and that did not pay another one after it, gets
 * one message with the pieces still on sale and a button that refills the cart. At most one a week
 * per chat, never for a piece that sold out, and «Non ricordarmelo più» stops them for good.
 */

/** One reminder per chat in this many days, whatever it leaves in the cart. */
export const REMINDER_GAP_DAYS = 7;
/** How far back the morning look reads Stripe: the day before and a bit. */
export const REMINDER_LOOKBACK_HOURS = 26;

const OPT_OUT = "gd:c:x";
const REMINDED_PREFIX = "cart-reminded:";
const OPT_OUT_PREFIX = "cart-optout:";

function signature(chatId: string, secret: string): string {
  return createHmac("sha256", secret).update(`cart:${chatId}`).digest("base64url").slice(0, 12);
}

/** The token a private chat's cart links carry; null for anything that is not a private chat. */
export function cartToken(chatId: string, secret: string): string | null {
  if (!/^\d{4,20}$/.test(chatId)) return null;
  return `${chatId}.${signature(chatId, secret)}`;
}

/** The chat a token names, when the server signed it; null otherwise. */
export function chatFromCartToken(token: string | null | undefined, secret: string | null | undefined): string | null {
  if (!token || !secret || !TELEGRAM_CART_TOKEN.test(token)) return null;
  const [chatId, given] = token.split(".") as [string, string];
  const expected = Buffer.from(signature(chatId, secret));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? chatId : null;
}

const CART_PREFIX = `${PRODUCTION_ORIGIN}/carrello`;

/** A shop cart link with the chat's token added; any other address comes back as it was. */
export function withCartToken(url: string, token: string): string {
  if (!url.startsWith(CART_PREFIX)) return url;
  const address = new URL(url);
  address.searchParams.set(TELEGRAM_CART_PARAM, token);
  return address.toString();
}

/**
 * The bot's gateway, with every cart link it sends to a private chat signed for that chat. The
 * owner's chat and the channel are left as they are: a post read by many must not carry one chat.
 */
export function cartTokenGateway(gateway: TelegramGateway, secret: string | null, ownerChatId: string): TelegramGateway {
  if (!secret) return gateway;
  const sign = (chatId: string, keyboard: InlineKeyboard | undefined): InlineKeyboard | undefined => {
    const token = chatId === ownerChatId ? null : cartToken(chatId, secret);
    if (!token || !keyboard) return keyboard;
    return keyboard.map((row) => row.map((button): InlineButton => ("url" in button ? { ...button, url: withCartToken(button.url, token) } : button)));
  };
  return {
    ...gateway,
    sendText: (chatId, html, keyboard) => gateway.sendText(chatId, html, sign(chatId, keyboard)),
    sendPost: (chatId, post, keyboard) => gateway.sendPost(chatId, post, sign(chatId, keyboard) ?? keyboard),
  };
}

/** What the morning look needs of a Stripe Checkout session. */
export type CartSession = {
  readonly id: string;
  /** Seconds since the epoch, as Stripe reports it. */
  readonly created: number;
  readonly status: "open" | "complete" | "expired";
  readonly metadata?: Readonly<Record<string, string>> | null;
};

export type CartReminderContext = {
  readonly telegram: TelegramGateway;
  readonly loadProducts: () => Promise<readonly Product[]>;
  /** The bot's memory (telegram_news_memory): who was reminded when, and who said no more. */
  readonly memory: {
    read(): Promise<ReadonlyMap<string, unknown>>;
    write(entries: ReadonlyMap<string, unknown>): Promise<void>;
  };
  /** The shop's Checkout sessions created since `since` (seconds), expired and complete. */
  readonly listSessions: (since: number) => Promise<readonly CartSession[]>;
  readonly now: () => Date;
};

/** "glory-valkerion-lf x2, cobalt-drake-4-60f x1" (the session's metadata) → the lines. */
export function sessionLines(metadata: Readonly<Record<string, string>> | null | undefined): readonly { readonly slug: string; readonly quantity: number }[] {
  const lines = metadata?.["lines"] ?? "";
  return [...lines.matchAll(/([a-z0-9-]{1,60}) x(\d{1,3})/g)].map((match) => ({ slug: match[1]!, quantity: Number(match[2]) }));
}

/** The cart link that puts those pieces back: one piece with its quantity, or several one each. */
export function cartLinkFor(lines: readonly { readonly slug: string; readonly quantity: number }[]): string {
  if (lines.length === 1) {
    const [line] = lines as [{ readonly slug: string; readonly quantity: number }];
    return shopLink(`/carrello?aggiungi=${line.slug}${line.quantity > 1 ? `&q=${line.quantity}` : ""}`);
  }
  return shopLink(`/carrello?aggiungi=${lines.slice(0, CART_LINK_PIECES).map((line) => line.slug).join(",")}`);
}

const recent = (value: unknown, now: Date, days: number) => {
  const at = typeof value === "object" && value !== null ? (value as { readonly at?: unknown }).at : undefined;
  return typeof at === "string" && now.getTime() - Date.parse(at) < days * 86_400_000;
};

/** The morning look: one reminder for each chat that left a cart from the bot unpaid yesterday. */
export async function remindAbandonedCarts(context: CartReminderContext): Promise<number> {
  const now = context.now();
  const since = Math.floor(now.getTime() / 1000) - REMINDER_LOOKBACK_HOURS * 3600;
  const sessions = (await context.listSessions(since)).filter((session) => /^\d{4,20}$/.test(session.metadata?.["telegram_chat"] ?? ""));
  if (sessions.length === 0) return 0;

  // The newest unpaid cart of each chat, unless the chat paid a session after it.
  const paidAfter = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== "complete") continue;
    const chat = session.metadata!["telegram_chat"]!;
    paidAfter.set(chat, Math.max(paidAfter.get(chat) ?? 0, session.created));
  }
  const left = new Map<string, CartSession>();
  for (const session of sessions) {
    if (session.status !== "expired") continue;
    const chat = session.metadata!["telegram_chat"]!;
    if ((paidAfter.get(chat) ?? 0) >= session.created) continue;
    const newest = left.get(chat);
    if (!newest || newest.created < session.created) left.set(chat, session);
  }
  if (left.size === 0) return 0;

  const memory = await context.memory.read();
  const products = new Map((await context.loadProducts()).map((product) => [product.slug as string, product]));
  let sent = 0;
  for (const [chat, session] of left) {
    if (memory.has(`${OPT_OUT_PREFIX}${chat}`) || recent(memory.get(`${REMINDED_PREFIX}${chat}`), now, REMINDER_GAP_DAYS)) continue;
    const lines = sessionLines(session.metadata).flatMap((line) => {
      const product = products.get(line.slug);
      return product && buyableOnShop(product) ? [{ ...line, product }] : [];
    });
    if (lines.length === 0) continue;
    const listed = lines.map((line) => `${line.quantity} × <b>${escapeTelegram(line.product.name)}</b> · ${formatPrice(line.product.price)}`);
    const text = ["<b>IL TUO CARRELLO //</b>", "Ieri hai lasciato nel carrello:", ...listed, "", "È ancora disponibile: lo riprendi da qui."].join("\n");
    const keyboard: InlineKeyboard = [[{ text: "Riprendi il carrello", url: cartLinkFor(lines) }], [{ text: "Non ricordarmelo più", callback_data: OPT_OUT }]];
    // Remembered before sending: a failed write must not turn into a second message tomorrow.
    await context.memory.write(new Map([[`${REMINDED_PREFIX}${chat}`, { at: now.toISOString(), session: session.id }]]));
    if ((await context.telegram.sendText(chat, text, keyboard)) !== null) sent += 1;
  }
  return sent;
}

/** «Non ricordarmelo più». Null when the tap is not this one. */
export async function cartTap(context: Pick<CartReminderContext, "memory" | "now">, tap: { readonly from: string; readonly data: string | undefined }): Promise<string | null> {
  if (tap.data !== OPT_OUT) return null;
  await context.memory.write(new Map([[`${OPT_OUT_PREFIX}${tap.from}`, { at: context.now().toISOString() }]]));
  return "Fatto: niente più promemoria del carrello.";
}
