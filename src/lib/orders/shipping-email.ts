import { SHOP_EMAIL } from "@/lib/email/resend";
import { addressLines } from "@/lib/admin/orders";
import {
  addressPanel,
  button,
  callout,
  dataTable,
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
  /** «Segui su Telegram», the bot's signed link for this order (lib/telegram/order-follow.ts). */
  readonly followUrl?: string | null;
};

export function shippingNotificationEmail(order: ShippedOrder) {
  const name = buyerFirstName(order.shippingAddress);
  const link = trackingLink(order.carrier, order.trackingCode, order.trackingUrl);
  const address = deliveryLines(order.shippingAddress);
  // An InPost pickup goes to the point the buyer named, not to their door.
  const addressHeading = pickupPointOf(order.shippingAddress) ? "Dove ritirarlo" : "Indirizzo di consegna";
  const subject = `Il tuo ordine ${order.orderNumber} è stato spedito · GEAR//DROP`;

  const courier: [string, string][] = [];
  if (order.carrier) courier.push(["Corriere", order.carrier]);
  if (order.trackingCode) courier.push(["Codice di tracciamento", order.trackingCode]);

  const html = emailShell(
    "Il tuo ordine è in viaggio",
    `${paragraph(`${name ? `Ciao ${escapeHtml(name)},` : "Ciao,"} abbiamo spedito il tuo ordine <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(order.orderNumber)}</strong>.`)}
    ${courier.length ? dataTable(courier) : callout("Il pacco è stato affidato al corriere.", "incoming")}
    ${link ? button("Segui il pacco", link, "now") : ""}
    ${
      order.followUrl
        ? paragraph(`Vuoi sapere dove si trova il pacco? ${emailLink("Segui su Telegram", order.followUrl, "incoming")}: ti scriviamo lì a ogni passaggio.`, { size: 14, top: 16 })
        : ""
    }
    ${label("Nel pacco")}
    ${itemList(order.items)}
    ${address.length ? `${label(addressHeading)}${addressPanel(address)}` : ""}
    ${paragraph(
      `Puoi ricontrollare lo stato dell&rsquo;ordine in qualsiasi momento su ${emailLink("geardropshop.it/ordine", "https://geardropshop.it/ordine")} usando il numero ordine e questa email. Con un account registrato con questa email trovi tutti i tuoi ordini, e dove si trova il pacco, su ${emailLink("geardropshop.it/account", "https://geardropshop.it/account")}.`,
      { size: 14, top: 24 },
    )}
    ${paragraph(`Qualcosa non torna? Rispondi a questa email o scrivi a ${shopEmailLink()} indicando il numero d'ordine.`, { size: 14 })}
    ${signOff()}`,
    {
      tone: "incoming",
      kicker: `In viaggio · ${order.orderNumber}`,
      preheader: order.carrier ? `Il pacco è partito con ${order.carrier}: qui trovi il tracciamento.` : "Il pacco è partito: qui trovi cosa contiene e dove va.",
    },
  );

  const text = [
    `${name ? `Ciao ${name},` : "Ciao,"} abbiamo spedito il tuo ordine ${order.orderNumber}.`,
    "",
    order.carrier ? `Corriere: ${order.carrier}` : "Il pacco è stato affidato al corriere.",
    order.trackingCode ? `Codice di tracciamento: ${order.trackingCode}` : null,
    link ? `Segui il pacco: ${link}` : null,
    order.followUrl ? `Segui su Telegram: ${order.followUrl}` : null,
    "",
    "Nel pacco:",
    ...order.items.map((item) => `- ${item.quantity} × ${item.name}`),
    ...(address.length ? ["", `${addressHeading}:`, ...address] : []),
    "",
    `Puoi ricontrollare lo stato dell'ordine su https://geardropshop.it/ordine (numero ordine + questa email).`,
    `Con un account registrato con questa email trovi tutti i tuoi ordini, e dove si trova il pacco, su https://geardropshop.it/account.`,
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
/** The InPost point or Locker the buyer chose at checkout, or null for a delivery to the door. */
export function pickupPointOf(address: unknown): string | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const point = (address as Record<string, unknown>)["pickupPoint"];
  return typeof point === "string" && point.trim() ? point.trim() : null;
}

function deliveryLines(address: unknown): readonly string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return [];
  const record = address as Record<string, unknown>;
  const value = (key: string) => (typeof record[key] === "string" ? String(record[key]).trim() : "");
  const pickup = pickupPointOf(address);
  if (pickup) {
    // Carrier-aware: derive from the method code stored in the shipping snapshot.
    const method = value("method");
    const isPoste = method.startsWith("poste");
    const isInpost = method.startsWith("inpost");
    const pointLabel = isPoste ? `Punto di ritiro Poste: ${pickup}` : isInpost ? `Punto InPost o Locker: ${pickup}` : `Punto di ritiro: ${pickup}`;
    const pickupNote = isPoste
      ? "Poste Italiane ti avvisa quando il pacco è disponibile al ritiro."
      : isInpost
        ? "InPost ti manda il codice per ritirarlo quando arriva."
        : "Il corriere ti avvisa quando il pacco è disponibile.";
    return [value("name"), pointLabel, pickupNote].filter(Boolean);
  }
  if (!value("address")) return addressLines(address);
  const place = [value("postalCode"), value("city"), value("province") ? `(${value("province")})` : ""].filter(Boolean).join(" ");
  return [value("name"), value("address"), place].filter(Boolean);
}

/** The buyer's first name from the shipping snapshot, capitalised; null when there is none. */
export function buyerFirstName(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const name = (address as Record<string, unknown>)["name"];
  if (typeof name !== "string" || !name.trim()) return null;
  const first = name.trim().split(/\s+/)[0]!;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
