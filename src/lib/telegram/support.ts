import type { TelegramGateway } from "./api";
import { escapeTelegram } from "./messages";

/**
 * Assistance through the bot (owner, 2026-11-28: "fai il resto"). A customer writes to the bot, in
 * words, with a photo or a voice note; the bot copies the message into the owner's chat, under a
 * header that says who wrote and, when the chat came from «C'è un problema», which order. The owner
 * answers with Telegram's own «Rispondi» on that copy, and the bot copies his answer back to the
 * customer. One inbox on his phone instead of messages scattered across Instagram.
 *
 * What the bot keeps is which copy belongs to which chat (and the order), never the text: the
 * messages stay in Telegram. Rows go after SUPPORT_KEEP_DAYS, as the privacy notice says. A message
 * the customer started may be answered alone; the bot never writes first.
 */

export const SUPPORT_KEEP_DAYS = 90;
/** A conversation that went quiet this long gets a new header in the owner's chat. */
export const CONVERSATION_GAP_HOURS = 12;
/** How many messages one chat can send in an hour before the bot stops copying them. */
export const HOURLY_LIMIT = 15;
/** «C'è un problema» ties the chat's next messages to the order for this long. */
export const ORDER_CONTEXT_DAYS = 7;

export type SupportLink = { readonly chatId: string; readonly orderId: number | null };

export type SupportStore = {
  /** Remembers that this message in the owner's chat belongs to that customer chat. */
  record(chatId: string, ownerMessageId: number, orderId: number | null): Promise<void>;
  /** The customer chat a message in the owner's chat belongs to, or null. */
  chatFor(ownerMessageId: number): Promise<SupportLink | null>;
  /** How many messages of this chat were copied to the owner since `since`. */
  countSince(chatId: string, since: Date): Promise<number>;
  /** The order this chat's recent messages are about, when «C'è un problema» named one. */
  orderFor(chatId: string, since: Date): Promise<number | null>;
  purge(before: Date): Promise<number>;
};

export type SupportContext = {
  readonly telegram: TelegramGateway;
  readonly ownerChatId: string;
  readonly store: SupportStore;
  readonly now: () => Date;
  /** "GD-ABC123" for an order id, for the header; null when unknown. */
  readonly orderNumber: (orderId: number) => Promise<string | null>;
  /** The shop's inbox, for when Telegram refuses a copy. */
  readonly shopEmail: string;
};

export type CustomerMessage = {
  readonly chatId: string;
  readonly messageId: number;
  readonly firstName: string | null;
  readonly username: string | null;
};

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);

/** The message the bot sends a customer who opens it with nothing else to do. */
export function supportWelcome(channelId: string | null, advisor: boolean): string {
  return [
    "<b>GEAR//DROP</b>",
    channelId?.startsWith("@") ? `Novità, arrivi e pre-ordini escono sul canale ${channelId}.` : null,
    advisor ? "Non sai cosa comprare? Scrivi /bey." : null,
    "Hai una domanda su un pezzo o su un ordine? Scrivila qui, anche con una foto: la legge il negozio e ti risponde in questa chat. Se ce l'hai, metti il numero d'ordine.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** A customer's message: copied to the owner, under a header when the conversation is new. */
export async function customerMessage(context: SupportContext, message: CustomerMessage): Promise<string> {
  const now = context.now();
  await context.store.purge(new Date(now.getTime() - SUPPORT_KEEP_DAYS * 86_400_000));
  const lastHour = await context.store.countSince(message.chatId, hoursAgo(now, 1));
  if (lastHour >= HOURLY_LIMIT) {
    // Told once, at the limit; what follows is dropped until the hour has passed.
    if (lastHour === HOURLY_LIMIT) {
      // A marker row (no message of the owner's chat has a negative id) lifts the count past the
      // limit, so the notice is not repeated for every message that follows.
      await context.store.record(message.chatId, -now.getTime(), null).catch(() => undefined);
      await context.telegram.sendText(message.chatId, "Ci hai scritto molti messaggi di fila: li leggiamo e ti rispondiamo qui. Gli altri che mandi in quest'ora non arrivano.");
    }
    return "support-limit";
  }
  if (!context.telegram.copyMessage) return "support-off";

  const orderId = await context.store.orderFor(message.chatId, new Date(now.getTime() - ORDER_CONTEXT_DAYS * 86_400_000));
  const fresh = (await context.store.countSince(message.chatId, hoursAgo(now, CONVERSATION_GAP_HOURS))) === 0;
  if (fresh) {
    const who = [message.firstName ? escapeTelegram(message.firstName) : "Un cliente", message.username ? `(@${escapeTelegram(message.username)})` : null]
      .filter(Boolean)
      .join(" ");
    const order = orderId === null ? null : await context.orderNumber(orderId);
    const header = await context.telegram.sendText(
      context.ownerChatId,
      `<b>ASSISTENZA //</b>\nScrive ${who}.${order ? `\nOrdine ${escapeTelegram(order)}.` : ""}\nRispondi (tieni premuto, «Rispondi») a questo messaggio o a quelli sotto e glielo giro.`,
    );
    if (header !== null) await context.store.record(message.chatId, header, orderId);
  }
  const copy = await context.telegram.copyMessage(context.ownerChatId, message.chatId, message.messageId);
  if (copy === null) {
    await context.telegram.sendText(message.chatId, `Non riesco a passare il messaggio al negozio adesso: riprova tra poco, oppure scrivi a ${escapeTelegram(context.shopEmail)}.`);
    return "support-failed";
  }
  await context.store.record(message.chatId, copy, orderId);
  if (fresh) await context.telegram.sendText(message.chatId, "Ricevuto: lo legge il negozio e ti risponde qui.");
  return "support";
}

/**
 * The owner answered a copied message with «Rispondi»: his answer goes to that customer. Null when
 * the message he answered is not one of the bot's copies (then it is an ordinary message to the bot).
 */
export async function ownerReply(context: SupportContext, reply: { readonly repliedTo: number; readonly messageId: number }): Promise<string | null> {
  const link = await context.store.chatFor(reply.repliedTo);
  if (!link || !context.telegram.copyMessage) return null;
  const sent = await context.telegram.copyMessage(link.chatId, context.ownerChatId, reply.messageId);
  if (sent === null) {
    await context.telegram.sendText(context.ownerChatId, "Non consegnato: il cliente ha bloccato il bot o ha cancellato la chat.");
    return "support-reply-failed";
  }
  // His answer belongs to the same conversation: a «Rispondi» on it reaches the customer too.
  await context.store.record(link.chatId, reply.messageId, link.orderId);
  await context.telegram.sendText(context.ownerChatId, "Inviato.");
  return "support-reply";
}
