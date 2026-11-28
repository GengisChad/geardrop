import { z } from "zod";

/**
 * The bot's cart links carry the chat they were sent to, signed by the server ("tgc"; see
 * lib/telegram/cart-reminder.ts). The browser keeps that token for the visit and hands it to the
 * checkout, which checks the signature and puts the chat on the Stripe session. If the payment is not
 * completed, the bot can send that chat one reminder the next day.
 *
 * Only links the bot sends in a private chat carry a token: a channel post or a shared link never
 * does, so a cart opened from anywhere else is never followed. Free of server imports: the cart and
 * the checkout pages use it in the browser.
 */

export const TELEGRAM_CART_PARAM = "tgc";
export const TELEGRAM_CART_STORAGE_KEY = "gd-telegram-cart";

/** "<chat id>.<signature>": a private chat's id and twelve characters of the server's HMAC. */
export const TELEGRAM_CART_TOKEN = /^\d{4,20}\.[A-Za-z0-9_-]{12}$/;

/** What the server accepts from the browser: a well-shaped token, or nothing (never an error). */
export const telegramCartSchema = z.string().regex(TELEGRAM_CART_TOKEN).optional().catch(undefined);

type StorageWindow = Pick<Window, "location" | "sessionStorage">;

/** Notes the token of a bot link this page was opened with. A page without one leaves the note as it is. */
export function recordTelegramCart(win: StorageWindow = window): void {
  try {
    const token = new URLSearchParams(win.location.search).get(TELEGRAM_CART_PARAM);
    if (token && TELEGRAM_CART_TOKEN.test(token)) win.sessionStorage.setItem(TELEGRAM_CART_STORAGE_KEY, token);
  } catch {
    // Private browsing can refuse storage: the purchase goes on without a reminder.
  }
}

/** The checkout payload's field: present only when this visit came from a bot link. */
export function telegramCartForCheckout(win?: Pick<Window, "sessionStorage">): { telegramCart?: string } {
  if (typeof window === "undefined" && !win) return {};
  try {
    const token = (win ?? window).sessionStorage.getItem(TELEGRAM_CART_STORAGE_KEY);
    return token && TELEGRAM_CART_TOKEN.test(token) ? { telegramCart: token } : {};
  } catch {
    return {};
  }
}
