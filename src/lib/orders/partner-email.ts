import { CONSIGNMENT_PARTNER, partnerLines } from "@/data/catalog";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { escapeHtml, emailShell } from "./order-email";
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

  // Delivery block: pickup point (InPost or Poste Locker) or street address.
  const deliveryLines: string[] = [shipping.name];
  if (shipping.pickupPoint) {
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
    `<p style="margin:0 0 16px;color:#555">
      Nuovo ordine GEAR//DROP. I prodotti qui sotto sono tuoi: spediscili all'indirizzo indicato
      e rispondi a questa email con il codice di tracking una volta spediti.
    </p>
    <h2 style="font-size:16px;margin:0 0 8px">Articoli da spedire</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">
      ${lines.map((line) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(line.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">&times;&nbsp;${line.quantity}</td>
      </tr>`).join("")}
      <tr><td style="padding:8px 0;font-weight:bold">Totale da ricevere</td><td style="padding:8px 0;text-align:right;font-weight:bold">${escapeHtml(euro(totalOwed))}</td></tr>
    </table>
    <h2 style="font-size:16px;margin:24px 0 8px">Spedire a</h2>
    <div style="background:#f6f2ff;border-radius:8px;padding:16px;font-size:16px;line-height:1.5">
      ${deliveryLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
    </div>
    <p style="margin:24px 0 0;font-size:14px;color:#555">
      Una volta spedito, rispondi a questa email con il codice di tracking.<br/>
      Per qualsiasi dubbio scrivi a <a href="mailto:${SHOP_EMAIL}">${escapeHtml(SHOP_EMAIL)}</a>
      indicando il numero d'ordine ${escapeHtml(orderRef)}.
    </p>`,
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
