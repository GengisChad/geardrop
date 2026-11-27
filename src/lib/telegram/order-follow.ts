import { createHmac, timingSafeEqual } from "node:crypto";
import { eventLabel } from "@/lib/shipping/inpost-tracking";
import type { TelegramGateway } from "./api";
import { escapeTelegram, type InlineKeyboard } from "./messages";
import { TELEGRAM_BOT_URL } from "./restock-link";

/**
 * «Segui su Telegram» (owner, 2026-11-27): the order's emails carry a link that opens the bot with
 * that order, and from then on the bot writes in that chat when the parcel leaves, where InPost has
 * it, and when it is delivered. Then it forgets the chat.
 *
 * The link is signed (HMAC of the order id with the server's TELEGRAM_WEBHOOK_SECRET), so nobody
 * can follow an order by guessing its number. What the bot keeps is the chat and the order, and
 * the last thing it told; it deletes them at delivery, cancellation, «Non seguire più», or after
 * FOLLOW_KEEP_DAYS, as the privacy notice says.
 */

export const FOLLOW_KEEP_DAYS = 90;
const START = "or-";

function signature(orderId: number, secret: string): string {
  return createHmac("sha256", secret).update(`order-follow:${orderId}`).digest("base64url").slice(0, 16);
}

/** "or-41-<signature>": the /start payload of an order's link, within Telegram's 64 characters. */
export function orderFollowPayload(orderId: number, secret: string): string {
  return `${START}${orderId}-${signature(orderId, secret)}`;
}

/** The link the order's emails carry; null while the bot has no secret to sign it with. */
export function orderFollowUrl(orderId: number, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const secret = env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  if (!secret || !env["TELEGRAM_BOT_TOKEN"]?.trim()) return null;
  return `${TELEGRAM_BOT_URL}?start=${orderFollowPayload(orderId, secret)}`;
}

/** The order a "/start or-…" names, when its signature is the server's; null otherwise. */
export function orderFromFollowStart(text: string, secret: string | null): number | null {
  const match = /^\/start\s+or-(\d{1,12})-([A-Za-z0-9_-]{16})$/.exec(text.trim());
  if (!match || !secret) return null;
  const orderId = Number(match[1]);
  const expected = Buffer.from(signature(orderId, secret));
  const given = Buffer.from(match[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given) ? orderId : null;
}

export type FollowedOrder = {
  readonly id: number;
  readonly orderNumber: string;
  readonly status: string;
  readonly carrier: string | null;
  readonly trackingCode: string | null;
  readonly trackingUrl: string | null;
};

export type Follower = { readonly id: number; readonly chatId: string; readonly lastTold: string | null };

export type FollowStore = {
  loadOrder(orderId: number): Promise<FollowedOrder | null>;
  /** Keeps the chat on the order; answers the follow's id, the same one when asked twice. */
  follow(orderId: number, chatId: string, told: string): Promise<number>;
  unfollow(id: number, chatId: string): Promise<boolean>;
  followers(orderId: number): Promise<readonly Follower[]>;
  told(id: number, what: string): Promise<void>;
  forgetOrder(orderId: number): Promise<void>;
  purge(before: Date): Promise<number>;
};

export type FollowContext = { readonly telegram: TelegramGateway; readonly store: FollowStore; readonly now: () => Date; readonly secret: string | null };

const UNFOLLOW = "gd:f:x:";

export function parseFollowAction(data: string | undefined): { readonly id: number } | null {
  const match = /^gd:f:x:(\d{1,12})$/.exec(data ?? "");
  return match ? { id: Number(match[1]) } : null;
}

const trackButton = (order: FollowedOrder): InlineKeyboard => (order.trackingUrl ? [[{ text: "Traccia il pacco", url: order.trackingUrl }]] : []);
const unfollowButton = (id: number): InlineKeyboard => [[{ text: "Non seguire più", callback_data: `${UNFOLLOW}${id}` }]];
const head = (order: FollowedOrder) => `<b>ORDINE ${escapeTelegram(order.orderNumber)} //</b>`;

/** Where the order stands, as the bot says it when the link is opened. */
export function orderStatusText(order: FollowedOrder): string {
  switch (order.status) {
    case "shipped":
      return `${head(order)}\nSpedito${order.carrier ? ` con ${escapeTelegram(order.carrier)}` : ""}.${order.trackingCode ? `\nTracking: ${escapeTelegram(order.trackingCode)}` : ""}\nTi scrivo qui quando cambia qualcosa.`;
    case "completed":
      return `${head(order)}\nConsegnato. Buone battaglie!`;
    case "cancelled":
      return `${head(order)}\nAnnullato. Per qualsiasi dubbio rispondi all'email dell'ordine.`;
    default:
      return `${head(order)}\nPagato: lo stiamo preparando. Ti scrivo qui quando parte.`;
  }
}

/** "/start or-<id>-<signature>" from an order's email. Null when the message is something else. */
export async function startFollow(context: FollowContext, chatId: string, text: string): Promise<string | null> {
  if (!/^\/start\s+or-/.test(text.trim())) return null;
  const orderId = orderFromFollowStart(text, context.secret);
  const order = orderId === null ? null : await context.store.loadOrder(orderId);
  if (!order) {
    await context.telegram.sendText(chatId, "Questo link non è valido. Apri quello nell'email dell'ordine.");
    return "follow";
  }
  if (order.status === "completed" || order.status === "cancelled") {
    await context.telegram.sendText(chatId, orderStatusText(order));
    return "follow";
  }
  const id = await context.store.follow(order.id, chatId, order.status);
  await context.telegram.sendText(chatId, orderStatusText(order), [...trackButton(order), ...unfollowButton(id)]);
  return "follow";
}

/** «Non seguire più», from the chat that follows. Null when the tap is not this one's. */
export async function followTap(context: FollowContext, tap: { readonly from: string; readonly data: string | undefined }): Promise<string | null> {
  const action = parseFollowAction(tap.data);
  if (!action) return null;
  return (await context.store.unfollow(action.id, tap.from)) ? "Non ti scrivo più per questo ordine." : "Già fatto.";
}

/** InPost codes worth a message to the buyer: the parcel's real steps, not every scan. */
const TOLD_CODES = new Set(["LMD.1001", "LMD.1003", "LMD.1004", "LMD.1005", "LMD.3001", "LMD.3014", "LMD.9001", "LMD.9002", "LMD.9003", "INF.9001"]);

export type OrderUpdate = { readonly kind: "shipped" } | { readonly kind: "inpost"; readonly code: string } | { readonly kind: "delivered" };

/** Tells every chat that follows the order what changed, once; at delivery it forgets them. */
export async function tellFollowers(context: FollowContext, orderId: number, update: OrderUpdate): Promise<number> {
  await context.store.purge(new Date(context.now().getTime() - FOLLOW_KEEP_DAYS * 86_400_000));
  const followers = await context.store.followers(orderId);
  if (followers.length === 0) return 0;
  const what = update.kind === "inpost" ? update.code : update.kind;
  if (update.kind === "inpost" && !TOLD_CODES.has(update.code)) return 0;
  const order = await context.store.loadOrder(orderId);
  if (!order) return 0;
  const text =
    update.kind === "shipped"
      ? orderStatusText({ ...order, status: "shipped" })
      : update.kind === "delivered"
        ? orderStatusText({ ...order, status: "completed" })
        : `${head(order)}\n${escapeTelegram(eventLabel(update.code))}.`;
  let told = 0;
  for (const follower of followers) {
    if (follower.lastTold === what) continue;
    const keyboard = update.kind === "delivered" ? [] : [...trackButton(order), ...unfollowButton(follower.id)];
    if ((await context.telegram.sendText(follower.chatId, text, keyboard)) !== null) {
      told += 1;
      if (update.kind !== "delivered") await context.store.told(follower.id, what);
    }
  }
  if (update.kind === "delivered") await context.store.forgetOrder(orderId);
  return told;
}
