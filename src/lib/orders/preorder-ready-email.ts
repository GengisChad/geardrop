import { SHOP_EMAIL } from "@/lib/email/resend";
import { emailShell, escapeHtml } from "./order-email";

/**
 * "La merce del tuo pre-ordine è arrivata": si manda quando il carico porta a magazzino i pezzi
 * che un ordine pagato aspettava, prima della spedizione vera. Dice cosa è arrivato e cosa
 * succede adesso, senza promettere una data che non conosciamo.
 */

export type PreorderReadyOrder = {
  readonly orderNumber: string;
  readonly email: string;
  readonly buyerName: string | null;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
};

export function preorderReadyEmail(order: PreorderReadyOrder) {
  const name = order.buyerName?.trim().split(/\s+/)[0] ?? null;
  const subject = `È arrivato: il tuo pre-ordine ${order.orderNumber} parte a breve · GEAR//DROP`;
  const greeting = name ? `Ciao ${escapeHtml(name)},` : "Ciao,";

  const html = emailShell(
    "La merce del tuo pre-ordine è arrivata",
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${greeting} la merce del tuo pre-ordine <strong>${escapeHtml(order.orderNumber)}</strong> è arrivata in magazzino.</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Lo prepariamo e lo spediamo al più presto: riceverai una seconda email con corriere e codice di tracciamento quando il pacco parte.</p>
    <h2 style="font-size:16px;margin:24px 0 8px">Cosa è arrivato</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${order.items.map((item) => `<li>${item.quantity} × ${escapeHtml(item.name)}</li>`).join("")}</ul>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5">Non devi fare nulla: il pagamento è già stato registrato. Puoi controllare l&rsquo;ordine su <a href="https://geardropshop.it/ordine" style="color:#c6ff00">geardropshop.it/ordine</a> con il numero ordine e questa email.</p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5">Devi cambiare l&rsquo;indirizzo o hai una domanda? Rispondi a questa email o scrivi a <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> indicando il numero d&rsquo;ordine.</p>
    <p style="margin:16px 0 0;font-size:14px">Grazie per l&rsquo;attesa e buone battaglie!<br>GEAR//DROP</p>`,
  );

  const text = [
    `${name ? `Ciao ${name},` : "Ciao,"} la merce del tuo pre-ordine ${order.orderNumber} è arrivata in magazzino.`,
    "",
    "Lo prepariamo e lo spediamo al più presto: riceverai una seconda email con corriere e codice di tracciamento quando il pacco parte.",
    "",
    "Cosa è arrivato:",
    ...order.items.map((item) => `- ${item.quantity} × ${item.name}`),
    "",
    "Non devi fare nulla: il pagamento è già stato registrato.",
    "Controlla l'ordine su https://geardropshop.it/ordine (numero ordine + questa email).",
    `Domande o cambio indirizzo? Rispondi a questa email o scrivi a ${SHOP_EMAIL} indicando il numero d'ordine.`,
    "",
    "Grazie per l'attesa e buone battaglie!",
    "GEAR//DROP",
  ].join("\n");

  return { to: order.email, subject, html, text };
}
