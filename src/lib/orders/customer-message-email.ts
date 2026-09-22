import { SHOP_EMAIL } from "@/lib/email/resend";
import { emailShell, escapeHtml } from "./order-email";
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
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"}</p>
    <div style="font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(order.message)}</div>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5">Il tuo ordine è <strong>${escapeHtml(order.orderNumber)}</strong>: puoi rivederlo su <a href="https://geardropshop.it/ordine" style="color:#c6ff00">geardropshop.it/ordine</a> con il numero e questa email.</p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5">Rispondi pure a questa email o scrivi a <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a>.</p>
    <p style="margin:16px 0 0;font-size:14px">GEAR//DROP</p>`,
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
