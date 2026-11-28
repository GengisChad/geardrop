import { button, emailShell, escapeHtml, note, paragraph, signOff } from "@/lib/email/template";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { EmailMessage } from "@/lib/email/resend";

type RestockEmailInput = {
  readonly productName: string;
  readonly productSlug: string;
  readonly to: string;
};

/**
 * Notification email sent to a buyer who signed up via the "Avvisami" form when
 * the product is back in stock. Lime, the shop's "subito": the piece is on the shelf now.
 */
export function restockNotificationEmail(input: RestockEmailInput): EmailMessage {
  const { productName, productSlug, to } = input;
  const pdpUrl = `${PRODUCTION_ORIGIN}/prodotto/${encodeURIComponent(productSlug)}`;
  const subject = `${productName} è di nuovo disponibile · GEAR//DROP`;

  const html = emailShell(
    `${productName} è di nuovo disponibile`,
    `${paragraph(`Buone notizie: <strong>${escapeHtml(productName)}</strong> è tornato disponibile su GEAR//DROP. Ci hai chiesto di avvisarti, ed eccoci.`)}
    ${button("Acquista ora", pdpUrl, "now")}
    ${signOff()}
    ${note(
      "Hai ricevuto questa email perché hai richiesto un avviso di disponibilità su geardropshop.it. Se non desideri ricevere altri avvisi, ignora questa email.",
    )}`,
    { tone: "now", kicker: "Di nuovo disponibile", preheader: `${productName} è tornato sullo scaffale.` },
  );

  const text = [
    `${productName} è di nuovo disponibile su GEAR//DROP.`,
    "",
    `Acquistalo ora: ${pdpUrl}`,
    "",
    "Hai ricevuto questa email perché hai richiesto un avviso di disponibilità su geardropshop.it.",
    "Se non desideri ricevere altri avvisi, ignora questa email.",
  ].join("\n");

  return { to, subject, html, text };
}
