import type { InlineKeyboard, TelegramPost } from "./messages";
import type { InlineArticle } from "./inline-search";

/**
 * Telegram's Bot API over plain fetch, without an SDK (the way src/lib/email/resend.ts talks to Resend).
 *
 * The token is part of the request address, so nothing here ever logs or returns an address: a
 * failure carries Telegram's own description and nothing else.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type TelegramConfig = {
  readonly token: string;
  /** The owner's private chat with the bot: drafts go there, and only that account may publish. */
  readonly ownerChatId: string;
  /** The public channel (`@name` or its numeric id). Without one, published posts stay in the owner's chat. */
  readonly channelId: string | null;
  /** What Telegram must send back with every webhook call. */
  readonly webhookSecret: string | null;
};

const TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID = /^(-?\d{4,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;

/** The bot's settings, or null while the owner has not finished setting it up: the bot is then simply off. */
export function readTelegramConfig(env: Env = process.env): TelegramConfig | null {
  const token = env["TELEGRAM_BOT_TOKEN"]?.trim();
  const ownerChatId = env["TELEGRAM_OWNER_CHAT_ID"]?.trim();
  if (!token || !TOKEN.test(token) || !ownerChatId || !/^\d{4,20}$/.test(ownerChatId)) return null;
  const channelId = env["TELEGRAM_CHANNEL_ID"]?.trim();
  return {
    token,
    ownerChatId,
    channelId: channelId && CHAT_ID.test(channelId) ? channelId : null,
    webhookSecret: env["TELEGRAM_WEBHOOK_SECRET"]?.trim() || null,
  };
}

export type TelegramResult<T> = { readonly ok: true; readonly result: T } | { readonly ok: false; readonly description: string };

export async function callTelegram<T>(
  token: string,
  method: string,
  payload: Readonly<Record<string, unknown>>,
  fetcher: typeof fetch = fetch,
): Promise<TelegramResult<T>> {
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as { readonly ok?: boolean; readonly result?: T; readonly description?: string };
    if (!response.ok || body.ok !== true) return { ok: false, description: `${response.status} ${body.description ?? ""}`.trim() };
    return { ok: true, result: body.result as T };
  } catch (error) {
    // A network error's message can quote the address, and the address holds the token.
    return { ok: false, description: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network error" };
  }
}

/** What the rest of the bot asks of Telegram. Tests pass their own. */
export type TelegramGateway = {
  /** Sends a post and answers with its message id, or null if Telegram refused it. */
  sendPost(chatId: string, post: TelegramPost, keyboard: InlineKeyboard): Promise<number | null>;
  sendText(chatId: string, html: string, keyboard?: InlineKeyboard): Promise<number | null>;
  setKeyboard(chatId: string, messageId: number, keyboard: InlineKeyboard): Promise<boolean>;
  deleteMessage(chatId: string, messageId: number): Promise<boolean>;
  answerCallback(callbackId: string, text: string): Promise<void>;
  /** Answers an inline search ("@GearDropNewsBot dran") with the pieces it found. */
  answerInline(queryId: string, results: readonly InlineArticle[]): Promise<boolean>;
};

type SentMessage = { readonly message_id: number };

export function createTelegramGateway(config: TelegramConfig, fetcher: typeof fetch = fetch): TelegramGateway {
  const call = <T>(method: string, payload: Readonly<Record<string, unknown>>) => callTelegram<T>(config.token, method, payload, fetcher);
  const log = (method: string, result: TelegramResult<unknown>) => {
    if (!result.ok) console.error(`[telegram] ${method}: ${result.description}`);
  };

  return {
    async sendPost(chatId, post, keyboard) {
      const reply_markup = { inline_keyboard: keyboard };
      if (post.videoUrl) {
        const video = await call<SentMessage>("sendVideo", {
          chat_id: chatId,
          video: post.videoUrl,
          caption: post.text,
          parse_mode: "HTML",
          supports_streaming: true,
          reply_markup,
        });
        if (video.ok) return video.result.message_id;
        // Telegram could not fetch or read the clip: the packshot goes out in its place.
        log("sendVideo", video);
      }
      if (post.photoUrl) {
        const photo = await call<SentMessage>("sendPhoto", { chat_id: chatId, photo: post.photoUrl, caption: post.text, parse_mode: "HTML", reply_markup });
        if (photo.ok) return photo.result.message_id;
        // Telegram could not fetch or read the picture: the post still goes out, with the page's preview.
        log("sendPhoto", photo);
      }
      const message = await call<SentMessage>("sendMessage", {
        chat_id: chatId,
        text: post.text,
        parse_mode: "HTML",
        link_preview_options: { url: post.link.url, prefer_large_media: true, show_above_text: true },
        reply_markup,
      });
      log("sendMessage", message);
      return message.ok ? message.result.message_id : null;
    },
    async sendText(chatId, html, keyboard) {
      const message = await call<SentMessage>("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      });
      log("sendMessage", message);
      return message.ok ? message.result.message_id : null;
    },
    async setKeyboard(chatId, messageId, keyboard) {
      const result = await call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
      log("editMessageReplyMarkup", result);
      return result.ok;
    },
    async deleteMessage(chatId, messageId) {
      const result = await call("deleteMessage", { chat_id: chatId, message_id: messageId });
      log("deleteMessage", result);
      return result.ok;
    },
    async answerCallback(callbackId, text) {
      log("answerCallbackQuery", await call("answerCallbackQuery", { callback_query_id: callbackId, text }));
    },
    async answerInline(queryId, results) {
      // A short cache: the price and the stock a result shows are the shop's of a minute ago at most.
      const result = await call("answerInlineQuery", { inline_query_id: queryId, results, cache_time: 60, is_personal: false });
      log("answerInlineQuery", result);
      return result.ok;
    },
  };
}

/** Where a published post can be opened: only a public channel has an address. */
export function channelPostUrl(channelId: string | null, messageId: number): string | null {
  return channelId?.startsWith("@") ? `https://t.me/${channelId.slice(1)}/${messageId}` : null;
}
