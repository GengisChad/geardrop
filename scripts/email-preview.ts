/**
 * Renders every email the shop sends, with sample data, to output/email-preview/: one HTML file
 * per email and an index.html that shows them side by side. Nothing is sent.
 *
 *   pnpm email:preview
 *
 * Open output/email-preview/index.html in a browser to check the template after a change.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_EMBLEM } from "@/lib/email/template";
import { newsletterConfirmEmail } from "@/lib/newsletter/confirm-email";
import { customerMessageEmail } from "@/lib/orders/customer-message-email";
import { deliveryConfirmationEmail } from "@/lib/orders/delivery-email";
import { inpostAlertEmail } from "@/lib/orders/inpost-alert-email";
import { customerOrderEmail, ownerOrderEmail } from "@/lib/orders/order-email";
import { partnerOrderEmail } from "@/lib/orders/partner-email";
import { preorderReadyEmail } from "@/lib/orders/preorder-ready-email";
import { refundNotificationEmail } from "@/lib/orders/refund-email";
import { restockNotificationEmail } from "@/lib/orders/restock-email";
import { shippingNotificationEmail } from "@/lib/orders/shipping-email";
import type { PaidCheckout } from "@/lib/orders/stripe-order";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

const OUT = join(process.cwd(), "output", "email-preview");

const shippingAddress = { name: "mario rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT" };
const items = [
  { name: "Glory Valkerion LF", quantity: 1 },
  { name: "Duo Shatter Horus + Hurricane Enlil", quantity: 2 },
];

const checkout: PaidCheckout = {
  sessionId: "cs_preview",
  paymentIntentId: "pi_preview",
  reference: "GD-FL3NHC8W",
  email: "cliente@example.com",
  phone: "3331234567",
  shipping: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT", method: "inpost-locker", methodLabel: "InPost Locker", pickupPoint: "TRI01M · Via Carducci 12, Trieste" },
  notes: "Lasciare il pacco in veranda",
  lines: [
    { slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 1, unitPriceCents: 3000 },
    { slug: "cobalt-drake-4-60f", name: "Cobalt Drake 4-60F", quantity: 2, unitPriceCents: 2490 },
  ],
  shippingCents: 490,
  discountCents: 500,
  couponCode: "BENVENUTO5",
  totalCents: 7970,
  createdAt: "2026-11-28T15:42:00.000Z",
};
const recorded = { id: 41, orderNumber: "GD-FL3NHC8W" };
const preorder = { ...recorded, preorderQuantities: [1, 0] };
const tracked = { orderNumber: "GD-FL3NHC8W", email: "cliente@example.com", carrier: "InPost", trackingCode: "520000012345678901234567", trackingUrl: null, shippingAddress, items };

const emails: readonly { readonly file: string; readonly name: string; readonly html: string }[] = [
  { file: "01-ordine-confermato.html", name: "Ordine confermato (cliente)", html: customerOrderEmail(checkout, recorded, "https://t.me/GearDropNewsBot?start=ord-preview").html },
  { file: "02-ordine-con-preordine.html", name: "Ordine con pre-ordine (cliente)", html: customerOrderEmail(checkout, preorder, null).html },
  { file: "03-spedito.html", name: "Spedito", html: shippingNotificationEmail({ ...tracked, followUrl: "https://t.me/GearDropNewsBot?start=ord-preview" }).html },
  { file: "04-consegnato.html", name: "Consegnato", html: deliveryConfirmationEmail(tracked).html },
  { file: "05-preordine-arrivato.html", name: "Pre-ordine arrivato", html: preorderReadyEmail({ orderNumber: "GD-FL3NHC8W", email: "cliente@example.com", buyerName: "Mario Rossi", items }).html },
  { file: "06-rimborso.html", name: "Rimborso", html: refundNotificationEmail({ orderNumber: "GD-FL3NHC8W", email: "cliente@example.com", shippingAddress, amountCents: 2490, refundedCents: 2490, totalCents: 7970, reason: "Il Cobalt Drake è arrivato con la confezione rovinata e non te lo mandiamo così.\nTi rimborsiamo quel pezzo, il resto parte domani." }).html },
  { file: "07-messaggio.html", name: "Messaggio dal pannello", html: customerMessageEmail({ orderNumber: "GD-FL3NHC8W", email: "cliente@example.com", shippingAddress, subject: "Il tuo Glory Valkerion è tornato", message: "Ciao! Il pezzo che aspettavi è arrivato stamattina.\nLo impacchettiamo oggi e domani parte con InPost." }).html },
  { file: "08-di-nuovo-disponibile.html", name: "Di nuovo disponibile", html: restockNotificationEmail({ productName: "Glory Valkerion LF", productSlug: "glory-valkerion-lf", to: "cliente@example.com" }).html },
  { file: "09-newsletter.html", name: "Conferma newsletter", html: newsletterConfirmEmail({ to: "cliente@example.com", token: "preview-token" }).html },
  { file: "10-nuovo-ordine-titolare.html", name: "Nuovo ordine (titolare)", html: ownerOrderEmail(checkout, preorder, [{ slug: "glory-valkerion-lf", name: "Glory Valkerion LF", stockQuantity: 0, stockStatus: "out_of_stock" }]).html },
  { file: "11-inpost-avviso.html", name: "Avviso InPost (titolare)", html: inpostAlertEmail({ id: 41, orderNumber: "GD-FL3NHC8W", trackingCode: "520000012345678901234567" }, "Pacco in ritorno al mittente", "returned_to_sender").html },
];

const partner = partnerOrderEmail(
  { ...checkout, lines: [{ slug: "cx-00-evangelion-deck-set", name: "CX-00 Evangelion Deck Set", quantity: 1, unitPriceCents: 5990 }] },
  "GD-FL3NHC8W",
);

mkdirSync(OUT, { recursive: true });
const all = partner ? [...emails, { file: "12-partner.html", name: "Ordine al partner", html: partner.html }] : emails;
// The emblem loads from the public site in a real email; here it is embedded from public/, so
// the preview shows it offline too.
const emblem = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", EMAIL_EMBLEM)).toString("base64")}`;
const local = (html: string) => html.replaceAll(`${PRODUCTION_ORIGIN}${EMAIL_EMBLEM}`, emblem);
for (const email of all) writeFileSync(join(OUT, email.file), local(email.html));

const index = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Email GEAR//DROP</title>
<style>body{margin:0;background:#2a2a33;font-family:Arial,sans-serif;color:#eee}h1{font-size:18px;padding:16px 20px;margin:0}
.grid{display:flex;flex-wrap:wrap;gap:20px;padding:0 20px 40px}figure{margin:0}figcaption{font-size:13px;margin:0 0 6px}
iframe{width:640px;height:1100px;border:0;background:#fff}</style></head><body><h1>Email GEAR//DROP · ${all.length} modelli</h1><div class="grid">
${all.map((email) => `<figure><figcaption>${email.name} · <a style="color:#c6ff00" href="${email.file}">${email.file}</a></figcaption><iframe src="${email.file}" title="${email.name}"></iframe></figure>`).join("\n")}
</div></body></html>`;
writeFileSync(join(OUT, "index.html"), index);
console.log(`${all.length} email in ${OUT}`);
