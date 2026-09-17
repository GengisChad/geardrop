import { SHOP_EMAIL } from "@/lib/email/resend";
import { addressLines } from "@/lib/admin/orders";
import { emailShell, escapeHtml } from "./order-email";
import { trackingLink } from "./carriers";

/**
 * The buyer's "your order has shipped" email: what is in the parcel, where it is going, the
 * courier and the link to follow it. Built from the stored order, so it can be sent (or sent
 * again) at any time after shipping.
 */

export type ShippedOrder = {
  readonly orderNumber: string;
  readonly email: string;
  readonly carrier: string | null;
  readonly trackingCode: string | null;
  readonly trackingUrl: string | null;
  readonly shippingAddress: unknown;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
};

export function shippingNotificationEmail(order: ShippedOrder) {
  const name = firstName(order.shippingAddress);
  const link = trackingLink(order.carrier, order.trackingCode, order.trackingUrl);
  const address = deliveryLines(order.shippingAddress);
  const subject = `Il tuo ordine ${order.orderNumber} è stato spedito · GEAR//DROP`;

  const courier = [
    order.carrier ? `<div>Corriere: <strong>${escapeHtml(order.carrier)}</strong></div>` : "",
    order.trackingCode ? `<div>Codice di tracciamento: <strong>${escapeHtml(order.trackingCode)}</strong></div>` : "",
  ].join("");

  const html = emailShell(
    "Il tuo ordine è in viaggio",
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} abbiamo spedito il tuo ordine <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
    <div style="background:#f6f2ff;border-radius:8px;padding:16px;font-size:15px;line-height:1.6">${courier || "<div>Il pacco è stato affidato al corriere.</div>"}</div>
    ${
      link
        ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#c6ff00;color:#07060b;font-weight:bold;text-decoration:none;padding:14px 20px;border-radius:6px">Segui il pacco</a></p>`
        : ""
    }
    <h2 style="font-size:16px;margin:24px 0 8px">Nel pacco</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${order.items.map((item) => `<li>${item.quantity} × ${escapeHtml(item.name)}</li>`).join("")}</ul>
    ${address.length ? `<h2 style="font-size:16px;margin:24px 0 8px">Indirizzo di consegna</h2><div style="line-height:1.5">${address.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>` : ""}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5">Qualcosa non torna? Rispondi a questa email o scrivi a <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> indicando il numero d'ordine.</p>
    <p style="margin:16px 0 0;font-size:14px">Grazie e buone battaglie!<br>GEAR//DROP</p>`,
  );

  const text = [
    `${name ? `Ciao ${name},` : "Ciao,"} abbiamo spedito il tuo ordine ${order.orderNumber}.`,
    "",
    order.carrier ? `Corriere: ${order.carrier}` : "Il pacco è stato affidato al corriere.",
    order.trackingCode ? `Codice di tracciamento: ${order.trackingCode}` : null,
    link ? `Segui il pacco: ${link}` : null,
    "",
    "Nel pacco:",
    ...order.items.map((item) => `- ${item.quantity} × ${item.name}`),
    ...(address.length ? ["", "Indirizzo di consegna:", ...address] : []),
    "",
    `Qualcosa non torna? Rispondi a questa email o scrivi a ${SHOP_EMAIL} indicando il numero d'ordine.`,
    "",
    "Grazie e buone battaglie!",
    "GEAR//DROP",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { to: order.email, subject, html, text };
}

/** Name, street and "CAP Città (PR)" on three lines, as a label reads; other shapes fall back to the admin's lines. */
function deliveryLines(address: unknown): readonly string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return [];
  const record = address as Record<string, unknown>;
  const value = (key: string) => (typeof record[key] === "string" ? String(record[key]).trim() : "");
  if (!value("address")) return addressLines(address);
  const place = [value("postalCode"), value("city"), value("province") ? `(${value("province")})` : ""].filter(Boolean).join(" ");
  return [value("name"), value("address"), place].filter(Boolean);
}

function firstName(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const name = (address as Record<string, unknown>)["name"];
  if (typeof name !== "string" || !name.trim()) return null;
  const first = name.trim().split(/\s+/)[0]!;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
