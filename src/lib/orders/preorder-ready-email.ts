import { SHOP_EMAIL } from "@/lib/email/resend";
import { EMAIL_COLORS, emailShell, escapeHtml, itemList, label, link, paragraph, shopEmailLink, signOff } from "@/lib/email/template";

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
    `${paragraph(`${greeting} la merce del tuo pre-ordine <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(order.orderNumber)}</strong> è arrivata in magazzino.`)}
    ${paragraph("Lo prepariamo e lo spediamo al più presto: riceverai una seconda email con corriere e codice di tracciamento quando il pacco parte.", { size: 15 })}
    ${label("Cosa è arrivato")}
    ${itemList(order.items)}
    ${paragraph(
      `Non devi fare nulla: il pagamento è già stato registrato. Puoi controllare l&rsquo;ordine su ${link("geardropshop.it/ordine", "https://geardropshop.it/ordine")} con il numero ordine e questa email.`,
      { size: 14, top: 24 },
    )}
    ${paragraph(`Devi cambiare l&rsquo;indirizzo o hai una domanda? Rispondi a questa email o scrivi a ${shopEmailLink()} indicando il numero d&rsquo;ordine.`, { size: 14 })}
    ${signOff("Grazie per l’attesa e buone battaglie!")}`,
    {
      tone: "now",
      kicker: `Arrivato · ${order.orderNumber}`,
      preheader: "La merce del tuo pre-ordine è arrivata: prepariamo il pacco.",
    },
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
