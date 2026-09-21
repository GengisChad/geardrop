import { SHOP_EMAIL } from "@/lib/email/resend";
import { emailShell, escapeHtml } from "./order-email";
import { buyerFirstName } from "./shipping-email";

/**
 * The buyer's refund email, sent from the admin right after a refund goes through on Stripe:
 * how much comes back, why, whether the rest of the order stands, and when the money arrives.
 * Stripe sends its own receipt as well; this one is the shop explaining it in its own words.
 */

export type RefundedOrder = {
  readonly orderNumber: string;
  readonly email: string;
  readonly shippingAddress: unknown;
  /** This refund. */
  readonly amountCents: number;
  /** Everything refunded on the order so far, this refund included. */
  readonly refundedCents: number;
  readonly totalCents: number;
  /** The owner's own words to the buyer, shown as written. */
  readonly reason: string;
};

const euro = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export function refundNotificationEmail(order: RefundedOrder) {
  const name = buyerFirstName(order.shippingAddress);
  const amount = euro(order.amountCents);
  const whole = order.refundedCents >= order.totalCents;
  const subject = `Rimborso di ${amount} per il tuo ordine ${order.orderNumber} · GEAR//DROP`;
  const standing = whole
    ? "L'ordine è rimborsato per intero."
    : "Il resto dell'ordine resta confermato: lo riceverai come previsto.";
  const timing = "Il rimborso torna sul metodo di pagamento che hai usato, di solito entro 5-10 giorni lavorativi. Stripe ti invia anche una ricevuta a parte.";

  const html = emailShell(
    "Ti abbiamo rimborsato",
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} abbiamo rimborsato <strong>${amount}</strong> sul tuo ordine <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
    <div style="background:#f6f2ff;border-radius:8px;padding:16px;font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(order.reason)}</div>
    <p style="margin:20px 0 0;font-size:15px;line-height:1.5">${standing}</p>
    <p style="margin:12px 0 0;font-size:15px;line-height:1.5">${timing}</p>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5">Qualcosa non torna? Rispondi a questa email o scrivi a <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> indicando il numero d'ordine.</p>
    <p style="margin:16px 0 0;font-size:14px">Grazie per la pazienza.<br>GEAR//DROP</p>`,
  );

  const text = [
    `${name ? `Ciao ${name},` : "Ciao,"} abbiamo rimborsato ${amount} sul tuo ordine ${order.orderNumber}.`,
    "",
    order.reason,
    "",
    standing,
    timing,
    "",
    `Qualcosa non torna? Rispondi a questa email o scrivi a ${SHOP_EMAIL} indicando il numero d'ordine.`,
    "",
    "Grazie per la pazienza.",
    "GEAR//DROP",
  ].join("\n");

  return { to: order.email, subject, html, text };
}
