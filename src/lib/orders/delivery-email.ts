import { SHOP_EMAIL } from "@/lib/email/resend";
import {
  callout,
  EMAIL_COLORS,
  emailShell,
  escapeHtml,
  itemList,
  label,
  link as emailLink,
  paragraph,
  shopEmailLink,
  signOff,
} from "@/lib/email/template";
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
    `${paragraph(`${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} il tuo ordine <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(order.orderNumber)}</strong> risulta consegnato.${order.carrier ? ` Il pacco è stato affidato a ${escapeHtml(order.carrier)}.` : ""}`)}
    ${label("Cosa c’era nel pacco")}
    ${itemList(order.items)}
    ${callout(
      `Scrivici entro pochi giorni a ${shopEmailLink()} indicando il numero d&rsquo;ordine e, se puoi, una foto. Lo sistemiamo noi.`,
      "info",
      "Manca qualcosa, o è arrivato rotto?",
    )}
    ${paragraph(
      `Hai <strong style="color:${EMAIL_COLORS.text}">${RETURN_WINDOW_DAYS} giorni dalla consegna</strong> per cambiare idea: il reso è gratuito, la spedizione la paghiamo noi. Come funziona è scritto su ${emailLink("geardropshop.it/assistenza/resi", "https://geardropshop.it/assistenza/resi")}.`,
      { size: 14, top: 20 },
    )}
    ${link ? paragraph(`Non ti risulta consegnato? Ricontrolla il percorso del pacco: ${emailLink("segui la spedizione", link)}.`, { size: 14 }) : ""}
    ${paragraph(`L&rsquo;ordine resta consultabile su ${emailLink("geardropshop.it/ordine", "https://geardropshop.it/ordine")} con il numero ordine e questa email.`, { size: 14 })}
    ${signOff()}`,
    {
      tone: "now",
      kicker: `Consegnato · ${order.orderNumber}`,
      preheader: "Il pacco risulta consegnato. Se manca qualcosa, scrivici: lo sistemiamo noi.",
    },
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
