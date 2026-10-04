import { SHOP_EMAIL } from "@/lib/email/resend";
import { emailShell, escapeHtml } from "./order-email";
import { trackingLink } from "./carriers";
import { buyerFirstName } from "./shipping-email";

/**
 * The buyer's "your order arrived" email. The shipping email ends when the parcel leaves; this one
 * closes the order from the buyer's side: what was in the box, how long they have to send it back,
 * and who to write to if something is missing or broken. Built from the stored order, so it can be
 * sent at any time after the order is completed, including long after the fact.
 */

export type DeliveredOrder = {
  readonly orderNumber: string;
  readonly email: string;
  readonly carrier: string | null;
  readonly trackingCode: string | null;
  readonly trackingUrl: string | null;
  readonly shippingAddress: unknown;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
};

/** Days the shop gives to change your mind, as the Resi e rimborsi page states it. */
export const RETURN_WINDOW_DAYS = 30;

export function deliveryConfirmationEmail(order: DeliveredOrder) {
  const name = buyerFirstName(order.shippingAddress);
  const link = trackingLink(order.carrier, order.trackingCode, order.trackingUrl);
  const subject = `Il tuo ordine ${order.orderNumber} è arrivato · GEAR//DROP`;

  const html = emailShell(
    "Il tuo ordine è arrivato",
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} il tuo ordine <strong>${escapeHtml(order.orderNumber)}</strong> risulta consegnato.${order.carrier ? ` Il pacco è stato affidato a ${escapeHtml(order.carrier)}.` : ""}</p>
    <h2 style="font-size:16px;margin:24px 0 8px">Cosa c&rsquo;era nel pacco</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${order.items.map((item) => `<li>${item.quantity} × ${escapeHtml(item.name)}</li>`).join("")}</ul>
    <div style="background:#f6f2ff;border-radius:8px;padding:16px;margin:24px 0 0;font-size:15px;line-height:1.6">
      <strong>Manca qualcosa, o è arrivato rotto?</strong><br>
      Scrivici entro pochi giorni a <a href="mailto:${SHOP_EMAIL}" style="color:#7a3cff">${SHOP_EMAIL}</a> indicando il numero d&rsquo;ordine e, se puoi, una foto. Lo sistemiamo noi.
    </div>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.5">Hai <strong>${RETURN_WINDOW_DAYS} giorni dalla consegna</strong> per cambiare idea: il reso è gratuito, la spedizione la paghiamo noi. Come funziona è scritto su <a href="https://geardropshop.it/assistenza/resi" style="color:#7a3cff">geardropshop.it/assistenza/resi</a>.</p>
    ${
      link
        ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5">Non ti risulta consegnato? Ricontrolla il percorso del pacco: <a href="${escapeHtml(link)}" style="color:#7a3cff">segui la spedizione</a>.</p>`
        : ""
    }
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5">L&rsquo;ordine resta consultabile su <a href="https://geardropshop.it/ordine" style="color:#7a3cff">geardropshop.it/ordine</a> con il numero ordine e questa email.</p>
    <p style="margin:24px 0 0;font-size:14px">Grazie e buone battaglie!<br>GEAR//DROP</p>`,
  );

  const text = [
    `${name ? `Ciao ${name},` : "Ciao,"} il tuo ordine ${order.orderNumber} risulta consegnato.`,
    order.carrier ? `Il pacco è stato affidato a ${order.carrier}.` : null,
    "",
    "Cosa c'era nel pacco:",
    ...order.items.map((item) => `- ${item.quantity} × ${item.name}`),
    "",
    `Manca qualcosa, o è arrivato rotto? Scrivici entro pochi giorni a ${SHOP_EMAIL} indicando il numero d'ordine e, se puoi, una foto. Lo sistemiamo noi.`,
    "",
    `Hai ${RETURN_WINDOW_DAYS} giorni dalla consegna per cambiare idea: il reso è gratuito, la spedizione la paghiamo noi. Come funziona: https://geardropshop.it/assistenza/resi`,
    link ? `Non ti risulta consegnato? Ricontrolla il percorso del pacco: ${link}` : null,
    `L'ordine resta consultabile su https://geardropshop.it/ordine (numero ordine + questa email).`,
    "",
    "Grazie e buone battaglie!",
    "GEAR//DROP",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { to: order.email, subject, html, text };
}
