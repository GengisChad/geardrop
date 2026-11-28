import { CONSIGNMENT_PARTNER, partnerLines, shippingMethodByCode } from "@/data/catalog";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { addressPanel, dataTable, emailShell, escapeHtml, itemList, label, paragraph, shopEmailLink } from "@/lib/email/template";
import type { PaidCheckout } from "./stripe-order";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Builds the email sent to NerdPoint for every paid order containing his consignment lines.
 *
 * Data minimisation: only name, delivery address / pickup point, phone, order number, and
 * products + owed are included — buyer email and payment details are deliberately omitted.
 */
export function partnerOrderEmail(checkout: PaidCheckout, orderRef: string) {
  const lines = partnerLines(checkout.lines);
  if (lines.length === 0) return null;

  const { shipping } = checkout;
  const totalOwed = lines.reduce((sum, line) => sum + line.owed, 0);

  const subject = `Ordine ${orderRef} da spedire · GEAR//DROP`;

  // Delivery block: the Punto Poste the buyer named on a Takara-only order, or the street address.
  // On a mixed cart the buyer's point is the shop's InPost Locker, which the partner cannot send
  // to: his parcel goes to the address instead (owner, 2026-10-23).
  const deliveryLines: string[] = [shipping.name];
  if (shipping.pickupPoint && shippingMethodByCode(shipping.method)?.carrier !== "inpost") {
    deliveryLines.push(`Punto di ritiro: ${shipping.pickupPoint}`);
  } else {
    const place = [shipping.postalCode, shipping.city, shipping.province ? `(${shipping.province})` : ""].filter(Boolean).join(" ");
    if (shipping.address) deliveryLines.push(shipping.address);
    if (place) deliveryLines.push(place);
    if (shipping.country && shipping.country !== "IT") deliveryLines.push(shipping.country);
  }
  if (checkout.phone) deliveryLines.push(`Tel: ${checkout.phone}`);

  const html = emailShell(
    `Ordine ${orderRef} da spedire`,
    `${paragraph("Nuovo ordine GEAR//DROP. I prodotti qui sotto sono tuoi: spediscili all'indirizzo indicato e rispondi a questa email con il codice di tracking una volta spediti.")}
    ${label("Articoli da spedire")}
    ${itemList(lines.map((line) => ({ name: line.name, quantity: line.quantity })))}
    ${dataTable([["Totale da ricevere", euro(totalOwed)]], { strongLast: true })}
    ${label("Spedire a")}
    ${addressPanel(deliveryLines)}
    ${paragraph(
      `Una volta spedito, rispondi a questa email con il codice di tracking.<br>Per qualsiasi dubbio scrivi a ${shopEmailLink()} indicando il numero d'ordine ${escapeHtml(orderRef)}.`,
      { size: 14, top: 24 },
    )}`,
    { tone: "now", kicker: `Da spedire · ${orderRef}`, preheader: `${lines.length} ${lines.length === 1 ? "articolo" : "articoli"} da spedire a ${shipping.name}.`, footer: "internal" },
  );

  const text = [
    `Ordine ${orderRef} da spedire — GEAR//DROP`,
    "",
    "ARTICOLI DA SPEDIRE",
    ...lines.map((line) => `${line.quantity} × ${line.name}`),
    `Totale da ricevere: ${euro(totalOwed)}`,
    "",
    "SPEDIRE A",
    ...deliveryLines,
    "",
    `Una volta spedito, rispondi con il codice di tracking.`,
    `Per dubbi: ${SHOP_EMAIL} — ordine ${orderRef}`,
  ].join("\n");

  return { subject, html, text, to: CONSIGNMENT_PARTNER.email };
}

/** The total owed to the partner for a set of lines, in cents. */
export function totalOwedCents(lines: readonly { readonly owed: number }[]): number {
  return lines.reduce((sum, line) => sum + line.owed, 0);
}
