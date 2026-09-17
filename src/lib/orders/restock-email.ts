import { emailShell, escapeHtml } from "@/lib/orders/order-email";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { EmailMessage } from "@/lib/email/resend";

type RestockEmailInput = {
  readonly productName: string;
  readonly productSlug: string;
  readonly to: string;
};

/**
 * Notification email sent to a buyer who signed up via the "Avvisami" form when
 * the product is back in stock. Uses the shared email shell from order-email.ts.
 */
export function restockNotificationEmail(input: RestockEmailInput): EmailMessage {
  const { productName, productSlug, to } = input;
  const pdpUrl = `${PRODUCTION_ORIGIN}/prodotto/${encodeURIComponent(productSlug)}`;
  const subject = `${productName} è di nuovo disponibile · GEAR//DROP`;

  const html = emailShell(
    `${productName} è di nuovo disponibile`,
    `<p style="margin:0 0 16px;color:#555">Buone notizie: ${escapeHtml(productName)} è tornato disponibile su GEAR//DROP.</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(pdpUrl)}"
         style="display:inline-block;background:#c6ff00;color:#07060b;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:6px">
        Acquista ora
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#888">
      Hai ricevuto questa email perché hai richiesto un avviso di disponibilità su geardropshop.it.
      Se non desideri ricevere altri avvisi, ignora questa email.
    </p>`,
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
