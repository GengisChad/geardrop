import { SHOP_EMAIL } from "@/lib/email/resend";
import { EMAIL_COLORS, emailShell, escapeHtml, link, paragraph, shopEmailLink, signOff } from "@/lib/email/template";
import { buyerFirstName } from "./shipping-email";

/**
 * A message the owner writes to a buyer from the admin, about their order: a piece back in
 * stock, a delay, an answer. The shop's own template so it reads like every other email it
 * sends, and the owner's words are shown exactly as typed, line breaks and all.
 */

export type CustomerMessage = {
  readonly orderNumber: string;
  readonly email: string;
  readonly shippingAddress: unknown;
  readonly subject: string;
  readonly message: string;
};

export function customerMessageEmail(order: CustomerMessage) {
  const name = buyerFirstName(order.shippingAddress);
  const subject = `${order.subject} · ordine ${order.orderNumber}`;

  const html = emailShell(
    order.subject,
    `${paragraph(name ? `Ciao ${escapeHtml(name)},` : "Ciao,")}
    <div style="font-size:16px;line-height:1.65;color:${EMAIL_COLORS.text};white-space:pre-line">${escapeHtml(order.message)}</div>
    ${paragraph(
      `Il tuo ordine è <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(order.orderNumber)}</strong>: puoi rivederlo su ${link("geardropshop.it/ordine", "https://geardropshop.it/ordine")} con il numero e questa email.`,
      { size: 14, top: 28 },
    )}
    ${paragraph(`Rispondi pure a questa email o scrivi a ${shopEmailLink()}.`, { size: 14 })}
    ${signOff("A presto,")}`,
    { tone: "info", kicker: `Ordine ${order.orderNumber}`, preheader: order.message.slice(0, 120) },
  );

  const text = [
    name ? `Ciao ${name},` : "Ciao,",
    "",
    order.message,
    "",
    `Il tuo ordine è ${order.orderNumber}: puoi rivederlo su https://geardropshop.it/ordine con il numero e questa email.`,
    `Rispondi pure a questa email o scrivi a ${SHOP_EMAIL}.`,
    "",
    "GEAR//DROP",
  ].join("\n");

  return { to: order.email, subject, html, text };
}
