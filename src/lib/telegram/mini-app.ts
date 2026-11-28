import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { InlineKeyboard } from "./messages";

/**
 * The shop inside Telegram (owner, 2026-11-28): the bot's menu button and its «Apri lo shop» button
 * open geardropshop.it as a Telegram Mini App, so a customer browses, fills the cart and pays without
 * leaving the chat. It is the site itself, with its own cart and Stripe checkout: nothing is priced
 * or stored on Telegram. The address is tagged, so an order placed there says it came from the bot.
 */

export const MINI_APP_URL = `${PRODUCTION_ORIGIN}/?utm_source=telegram&utm_medium=miniapp&utm_campaign=bot`;

/** «Apri lo shop»: a Mini App button, which Telegram shows in private chats only. */
export function shopButton(text = "Apri lo shop"): InlineKeyboard {
  return [[{ text, web_app: { url: MINI_APP_URL } }]];
}

/** The menu button next to the chat's text field (setChatMenuButton), for every private chat. */
export const MENU_BUTTON = { type: "web_app", text: "Shop", web_app: { url: MINI_APP_URL } } as const;
