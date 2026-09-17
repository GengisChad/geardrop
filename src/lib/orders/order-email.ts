import { PRODUCTS } from "@/data/catalog";
import { formatPrice } from "@/lib/format";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { PaidCheckout } from "./stripe-order";

/**
 * Emails for a paid order: the owner's notification carries everything needed to pack and
 * ship without opening another tool; the buyer's confirmation repeats what they bought.
 * Plain HTML tables with inline styles, which every mail client renders.
 */

export type RecordedOrder = { readonly id: number; readonly orderNumber: string };

const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });

const PRODUCT_NAME = new Map(PRODUCTS.map((product) => [product.slug as string, product.name]));

/** What to pack for a bundle line: every pack it ships, times the bundle quantity. */
function packingList(line: PaidCheckout["lines"][number]): string | null {
  if (!line.components?.length) return null;
  return line.components.map((part) => `${part.quantity * line.quantity} × ${PRODUCT_NAME.get(part.slug) ?? part.slug}`).join(" + ");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

function addressBlock(checkout: PaidCheckout): readonly string[] {
  const { shipping } = checkout;
  const place = [shipping.postalCode, shipping.city, shipping.province ? `(${shipping.province})` : ""].filter(Boolean).join(" ");
  return [shipping.name, shipping.address, place, shipping.country].filter(Boolean);
}

function subtotalCents(checkout: PaidCheckout): number {
  return checkout.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

function linesTable(checkout: PaidCheckout): string {
  const rows = checkout.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(line.name)}${
          packingList(line) ? `<div style="font-size:13px;color:#555;margin-top:2px">Da spedire: ${escapeHtml(packingList(line)!)}</div>` : ""
        }</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">× ${line.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${euro(line.quantity * line.unitPriceCents)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">
    ${rows}
    <tr><td style="padding:8px 0;color:#555">Subtotale</td><td></td><td style="padding:8px 0;text-align:right">${euro(subtotalCents(checkout))}</td></tr>
    <tr><td style="padding:4px 0;color:#555">Spedizione</td><td></td><td style="padding:4px 0;text-align:right">${checkout.shippingCents === 0 ? "Gratuita" : euro(checkout.shippingCents)}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold">Totale pagato</td><td></td><td style="padding:8px 0;text-align:right;font-weight:bold">${euro(checkout.totalCents)}</td></tr>
  </table>`;
}

/** The branded frame every GEAR//DROP email shares. */
export function emailShell(title: string, content: string): string {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:24px">
      <tr><td style="font-size:13px;letter-spacing:2px;color:#7a3cff;font-weight:bold">GEAR//DROP</td></tr>
      <tr><td style="padding-top:8px;font-size:22px;font-weight:bold">${escapeHtml(title)}</td></tr>
      <tr><td style="padding-top:16px">${content}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function ownerOrderEmail(checkout: PaidCheckout, order: RecordedOrder) {
  const address = addressBlock(checkout);
  const adminUrl = `${PRODUCTION_ORIGIN}/admin/ordini/${order.id}`;
  const stripeUrl = checkout.paymentIntentId ? `https://dashboard.stripe.com/payments/${checkout.paymentIntentId}` : null;
  const when = dateFormatter.format(new Date(checkout.createdAt));
  const subject = `Nuovo ordine ${order.orderNumber} · ${euro(checkout.totalCents)} · ${checkout.shipping.name || checkout.email}`;

  const html = emailShell(
    `Nuovo ordine ${order.orderNumber}`,
    `<p style="margin:0 0 16px;color:#555">Pagato su Stripe il ${escapeHtml(when)}. Da spedire a:</p>
    <div style="background:#f6f2ff;border-radius:8px;padding:16px;font-size:16px;line-height:1.5">
      ${address.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
      ${checkout.phone ? `<div style="margin-top:8px">Tel: <a href="tel:${escapeHtml(checkout.phone)}">${escapeHtml(checkout.phone)}</a></div>` : ""}
      <div>Email: <a href="mailto:${escapeHtml(checkout.email)}">${escapeHtml(checkout.email)}</a></div>
    </div>
    ${checkout.notes ? `<p style="margin:16px 0 0"><strong>Note del cliente:</strong> ${escapeHtml(checkout.notes)}</p>` : ""}
    <h2 style="font-size:16px;margin:24px 0 8px">Articoli</h2>
    ${linesTable(checkout)}
    <p style="margin:24px 0 0">
      <a href="${adminUrl}" style="display:inline-block;background:#c6ff00;color:#07060b;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:6px">Apri l'ordine nel pannello</a>
    </p>
    ${stripeUrl ? `<p style="margin:12px 0 0;font-size:13px"><a href="${stripeUrl}">Vedi il pagamento su Stripe</a></p>` : ""}
    <p style="margin:24px 0 0;font-size:12px;color:#888">Lo stock dei pezzi venduti è già stato scalato sul sito.</p>`,
  );

  const text = [
    `Nuovo ordine ${order.orderNumber} — pagato su Stripe il ${when}`,
    "",
    "SPEDIRE A",
    ...address,
    checkout.phone ? `Tel: ${checkout.phone}` : null,
    `Email: ${checkout.email}`,
    checkout.notes ? `Note del cliente: ${checkout.notes}` : null,
    "",
    "ARTICOLI",
    ...checkout.lines.flatMap((line) => [
      `${line.quantity} × ${line.name} — ${euro(line.quantity * line.unitPriceCents)}`,
      ...(packingList(line) ? [`   Da spedire: ${packingList(line)}`] : []),
    ]),
    `Spedizione: ${checkout.shippingCents === 0 ? "gratuita" : euro(checkout.shippingCents)}`,
    `Totale pagato: ${euro(checkout.totalCents)}`,
    "",
    `Pannello: ${adminUrl}`,
    stripeUrl ? `Stripe: ${stripeUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, html, text };
}

export function customerOrderEmail(checkout: PaidCheckout, order: RecordedOrder) {
  const address = addressBlock(checkout);
  const subject = `Ordine ${order.orderNumber} confermato · GEAR//DROP`;
  const html = emailShell(
    "Grazie, il tuo ordine è confermato",
    `<p style="margin:0 0 16px;color:#555">Abbiamo ricevuto il pagamento dell'ordine <strong>${escapeHtml(order.orderNumber)}</strong>. Ti scriviamo appena parte il pacco.</p>
    ${linesTable(checkout)}
    <h2 style="font-size:16px;margin:24px 0 8px">Spedizione a</h2>
    <div style="line-height:1.5">${address.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
    <p style="margin:24px 0 0;font-size:14px">Domande? Rispondi a questa email o scrivi a <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> indicando il numero d'ordine.</p>`,
  );
  const text = [
    `Grazie, il tuo ordine ${order.orderNumber} è confermato.`,
    "",
    ...checkout.lines.map((line) => `${line.quantity} × ${line.name} — ${euro(line.quantity * line.unitPriceCents)}`),
    `Spedizione: ${checkout.shippingCents === 0 ? "gratuita" : euro(checkout.shippingCents)}`,
    `Totale pagato: ${euro(checkout.totalCents)}`,
    "",
    "Spedizione a:",
    ...address,
    "",
    `Domande? Scrivi a ${SHOP_EMAIL} indicando il numero d'ordine.`,
  ].join("\n");
  return { subject, html, text };
}
