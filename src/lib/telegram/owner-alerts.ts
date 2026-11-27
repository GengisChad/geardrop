import { formatPrice } from "@/lib/format";
import type { LowStockProduct } from "@/lib/orders/process-paid-checkout";
import type { PaidCheckout } from "@/lib/orders/stripe-order";
import { absoluteUrl } from "@/lib/seo";
import { escapeTelegram, type InlineKeyboard } from "./messages";

/**
 * The owner's private alerts from the bot (owner, 2026-11-27): each paid order with the pieces it
 * left low, a payment Stripe took that the shop did not record, and a summary every evening.
 *
 * They go to his chat with the bot only, never to the channel, and carry no buyer data: no name,
 * address, email or phone. Those stay in the back office and in the order email, so Telegram never
 * receives them, and the privacy notice needs no new line.
 */

export type OwnerMessage = { readonly text: string; readonly keyboard: InlineKeyboard };

const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });
const pieces = (count: number) => (count === 1 ? "1 pezzo" : `${count} pezzi`);

export function adminOrderUrl(orderId: number): string {
  return absoluteUrl(`/admin/ordini/${orderId}`);
}

/** How many low pieces a message lists by name; the rest are counted. */
export const LOW_STOCK_LISTED = 8;

function lowStockLines(products: readonly LowStockProduct[]): string[] {
  if (products.length === 0) return [];
  const shown = products.slice(0, LOW_STOCK_LISTED).map((product) => `${escapeTelegram(product.name)}: ${product.stockQuantity <= 0 ? "esaurito" : `ne restano ${product.stockQuantity}`}`);
  const more = products.length - LOW_STOCK_LISTED;
  return ["", "<b>Scorte basse</b>", ...shown, ...(more > 0 ? [`e altri ${more}`] : [])];
}

export type AlertCheckout = Pick<PaidCheckout, "lines" | "totalCents" | "shipping" | "couponCode" | "attribution">;

/** The moment Stripe's payment becomes an order: what was bought, for how much, what is left low. */
export function paidOrderAlert(checkout: AlertCheckout, order: { readonly id: number; readonly orderNumber: string }, lowStock: readonly LowStockProduct[]): OwnerMessage {
  const count = checkout.lines.reduce((sum, line) => sum + line.quantity, 0);
  const via = [checkout.shipping.methodLabel, checkout.couponCode ? `codice ${checkout.couponCode}` : null, checkout.attribution ? `da ${checkout.attribution.source}` : null]
    .filter((part): part is string => Boolean(part))
    .map(escapeTelegram);
  const text = [
    `<b>ORDINE PAGATO //</b> ${escapeTelegram(order.orderNumber)}`,
    `<b>${euro(checkout.totalCents)}</b> · ${pieces(count)}`,
    ...checkout.lines.map((line) => `${line.quantity}× ${escapeTelegram(line.name)}`),
    ...(via.length > 0 ? [via.join(" · ")] : []),
    ...lowStockLines(lowStock),
  ].join("\n");
  return { text, keyboard: [[{ text: "Apri l'ordine", url: adminOrderUrl(order.id) }]] };
}

/** Stripe took the money and the shop could not record the order: Stripe retries, he must know now. */
export function paidWithoutOrderAlarm(sessionIds: readonly string[]): string {
  return [
    "<b>ALLARME //</b> Stripe ha incassato ma l'ordine non è nel gestionale.",
    ...sessionIds.map((id) => `Sessione ${escapeTelegram(id)}`),
    "Stripe riprova da solo per tre giorni: se arriva l'avviso dell'ordine, si è sistemato. Se non arriva, guarda i log del webhook su Vercel.",
  ].join("\n");
}

export type DaySummary = {
  readonly day: Date;
  readonly orders: { readonly count: number; readonly totalCents: number; readonly pieces: number };
  /** Paid orders not shipped yet, of any day. */
  readonly toShip: number;
  readonly lowStock: readonly LowStockProduct[];
  /** Telegram pre-orders whose buyer has still to pay. */
  readonly preordersAwaitingPayment: number;
  /** «Avvisami» requests waiting, email and Telegram. */
  readonly restockWaiting: number;
  /** Stripe checkouts paid and not recorded as orders; null when the check could not run. */
  readonly unrecorded: readonly string[] | null;
};

const dayLabel = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

/** The evening summary: the day's orders, what waits for him, and whether every payment has its order. */
export function eveningSummary(summary: DaySummary): OwnerMessage {
  const { orders } = summary;
  const stripe =
    summary.unrecorded === null
      ? ["", "Controllo Stripe non riuscito stasera: guardalo domattina."]
      : summary.unrecorded.length > 0
        ? ["", `<b>Pagati su Stripe senza ordine: ${summary.unrecorded.length}</b>`, ...summary.unrecorded.map((id) => escapeTelegram(id))]
        : ["Stripe: ogni pagamento ha il suo ordine."];
  const waiting = [
    summary.toShip > 0 ? `Ordini pagati non spediti: ${summary.toShip}` : null,
    summary.preordersAwaitingPayment > 0 ? `Pre-ordini Telegram da pagare: ${summary.preordersAwaitingPayment}` : null,
    summary.restockWaiting > 0 ? `Avvisami in attesa: ${summary.restockWaiting}` : null,
  ].filter((line): line is string => line !== null);
  const text = [
    `<b>RIEPILOGO //</b> ${dayLabel.format(summary.day)}`,
    orders.count === 0 ? "Nessun ordine oggi." : `${orders.count === 1 ? "1 ordine" : `${orders.count} ordini`} · <b>${euro(orders.totalCents)}</b> · ${pieces(orders.pieces)}`,
    ...waiting,
    ...lowStockLines(summary.lowStock),
    ...stripe,
  ].join("\n");
  return { text, keyboard: [[{ text: "Apri il gestionale", url: absoluteUrl("/admin") }]] };
}

/** Midnight in Rome, as an instant: the start of the summary's day. */
export function startOfRomeDay(now: Date): Date {
  const romeDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [year, month, day] = romeDay(now).split("-").map(Number) as [number, number, number];
  // Rome is UTC+2 in summer and UTC+1 in winter: its midnight is 22:00 or 23:00 UTC the day before.
  const summer = new Date(Date.UTC(year, month - 1, day) - 2 * 3_600_000);
  return romeDay(summer) === romeDay(now) ? summer : new Date(summer.getTime() + 3_600_000);
}

export type StripeSessionRow = {
  readonly id: string;
  /** Unix seconds. */
  readonly created: number;
  readonly status?: string | null;
  readonly payment_status?: string | null;
  readonly metadata?: Readonly<Record<string, string>> | null;
};

/** How long a paid checkout may wait for its webhook before it counts as missing. */
export const WEBHOOK_GRACE_MINUTES = 15;

/** The shop's paid checkouts (they carry order_ref) older than the grace that have no order. */
export function unrecordedSessions(sessions: readonly StripeSessionRow[], recorded: ReadonlySet<string>, now: Date): string[] {
  const before = now.getTime() / 1000 - WEBHOOK_GRACE_MINUTES * 60;
  return sessions
    .filter((session) => session.payment_status === "paid" && session.status === "complete" && Boolean(session.metadata?.["order_ref"]))
    .filter((session) => session.created <= before && !recorded.has(session.id))
    .map((session) => session.id);
}
