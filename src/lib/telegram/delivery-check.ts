import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramGateway } from "./api";
import { escapeTelegram, type InlineKeyboard } from "./messages";
import { adminOrderUrl } from "./owner-alerts";
import type { SupportStore } from "./support";

/**
 * «Com'è andata?» (owner, 2026-11-28). A chat that followed its order on Telegram gets, with the
 * «Consegnato» message, two buttons. «Tutto ok» leaves a note on the order. «C'è un problema»
 * leaves a note too, tells the owner at once with the order's link, and ties the chat's next
 * messages to that order, so the photo of a broken piece reaches him under the right order number.
 *
 * Nothing else is asked and nothing is sent later: one question, at delivery, to people who chose to
 * follow the order here. No review is requested, so nobody is steered to praise in public.
 *
 * The buttons are signed with the order and the chat (TELEGRAM_WEBHOOK_SECRET), so a tap can only
 * speak for the order that chat followed.
 */

const ACTION = /^gd:d:(ok|ko):(\d{1,12}):([A-Za-z0-9_-]{10})$/;

function signature(orderId: number, chatId: string, secret: string): string {
  return createHmac("sha256", secret).update(`delivery:${orderId}:${chatId}`).digest("base64url").slice(0, 10);
}

export function deliveryCheckKeyboard(orderId: number, chatId: string, secret: string | null): InlineKeyboard {
  if (!secret) return [];
  const sig = signature(orderId, chatId, secret);
  return [
    [
      { text: "Tutto ok", callback_data: `gd:d:ok:${orderId}:${sig}` },
      { text: "C'è un problema", callback_data: `gd:d:ko:${orderId}:${sig}` },
    ],
  ];
}

export function parseDeliveryAction(data: string | undefined): { readonly verdict: "ok" | "ko"; readonly orderId: number; readonly signature: string } | null {
  const match = ACTION.exec(data ?? "");
  return match ? { verdict: match[1] as "ok" | "ko", orderId: Number(match[2]), signature: match[3]! } : null;
}

export type DeliveryCheckContext = {
  readonly telegram: TelegramGateway;
  readonly ownerChatId: string;
  readonly secret: string | null;
  readonly support: SupportStore;
  readonly orders: {
    /** Leaves a note on the order, as the back office's notes. */
    note(orderId: number, text: string): Promise<void>;
    orderNumber(orderId: number): Promise<string | null>;
  };
};

/** A tap on «Tutto ok» / «C'è un problema». Null when the tap is not one of these. */
export async function deliveryTap(
  context: DeliveryCheckContext,
  tap: { readonly from: string; readonly data: string | undefined; readonly messageId: number | null },
): Promise<string | null> {
  const action = parseDeliveryAction(tap.data);
  if (!action) return null;
  if (!context.secret) return "";
  const expected = Buffer.from(signature(action.orderId, tap.from, context.secret));
  const given = Buffer.from(action.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "";
  // One answer per message: the buttons go as soon as one is pressed.
  if (tap.messageId !== null) await context.telegram.setKeyboard(tap.from, tap.messageId, []);

  if (action.verdict === "ok") {
    await context.orders.note(action.orderId, "Telegram: il cliente dice che è arrivato tutto bene.");
    await context.telegram.sendText(tap.from, "Grazie! Buone battaglie.");
    return "Grazie!";
  }

  await context.orders.note(action.orderId, "Telegram: il cliente segnala un problema dopo la consegna (scrive nella chat del bot).");
  const number = (await context.orders.orderNumber(action.orderId)) ?? `#${action.orderId}`;
  const alert = await context.telegram.sendText(
    context.ownerChatId,
    `<b>PROBLEMA SEGNALATO //</b>\nOrdine ${escapeTelegram(number)}: dopo la consegna il cliente ha toccato «C'è un problema». Ti scrive qui sotto; rispondi ai suoi messaggi per scrivergli.`,
    [[{ text: "Apri l'ordine", url: adminOrderUrl(action.orderId) }]],
  );
  // The alert opens the conversation: what the customer writes next lands under it, with the order.
  if (alert !== null) await context.support.record(tap.from, alert, action.orderId);
  await context.telegram.sendText(tap.from, "Mi dispiace. Scrivimi qui cosa non va, anche con una foto: lo legge il negozio e ti risponde in questa chat.");
  return "Ti ascoltiamo.";
}
