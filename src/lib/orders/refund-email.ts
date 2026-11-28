import { SHOP_EMAIL } from "@/lib/email/resend";
import { callout, dataTable, emailShell, escapeHtml, paragraph, shopEmailLink, signOff } from "@/lib/email/template";
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
    `${paragraph(`${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} abbiamo rimborsato <strong>${amount}</strong> sul tuo ordine <strong>${escapeHtml(order.orderNumber)}</strong>.`)}
    ${callout(`<div style="white-space:pre-line">${escapeHtml(order.reason)}</div>`, "info")}
    ${dataTable([
      ["Rimborsato ora", amount],
      ...(order.refundedCents > order.amountCents ? ([["Rimborsato in totale", euro(order.refundedCents)]] as [string, string][]) : []),
      ["Totale dell'ordine", euro(order.totalCents)],
    ])}
    ${paragraph(escapeHtml(standing), { size: 15, top: 20 })}
    ${paragraph(escapeHtml(timing), { size: 15 })}
    ${paragraph(`Qualcosa non torna? Rispondi a questa email o scrivi a ${shopEmailLink("info")} indicando il numero d'ordine.`, { size: 14, top: 8 })}
    ${signOff("Grazie per la pazienza.")}`,
    {
      tone: "info",
      kicker: `Rimborso · ${order.orderNumber}`,
      preheader: `Rimborso di ${amount} sul metodo di pagamento che hai usato.`,
    },
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
