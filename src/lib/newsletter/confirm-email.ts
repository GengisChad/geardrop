import type { EmailMessage } from "@/lib/email/resend";
import { newsletterConfirmUrl } from "@/lib/newsletter/newsletter";
import { emailShell, escapeHtml } from "@/lib/orders/order-email";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

/**
 * The double opt-in email: nothing else reaches the address until its owner presses the button.
 * The link opens a page with one more button, so a mailbox scanner that follows links confirms nothing.
 */
export function newsletterConfirmEmail(input: { readonly to: string; readonly token: string; readonly origin?: string }): EmailMessage {
  const url = newsletterConfirmUrl(input.origin ?? PRODUCTION_ORIGIN, input.token);
  const subject = "Conferma l'iscrizione alle novità · GEAR//DROP";

  const html = emailShell(
    "Conferma l'iscrizione",
    `<p style="margin:0 0 16px;color:#555">Hai chiesto di ricevere le novità di GEAR//DROP: arrivi e riassortimenti dei Beyblade X. Questo è solo il primo drop.</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background:#c6ff00;color:#07060b;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:6px">
        Conferma l'iscrizione
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#888">
      Se non sei stato tu, ignora questa email: senza conferma non ti scriviamo. In ogni email trovi il link per cancellarti.
    </p>`,
  );

  const text = [
    "Hai chiesto di ricevere le novità di GEAR//DROP: arrivi e riassortimenti dei Beyblade X.",
    "",
    `Conferma l'iscrizione: ${url}`,
    "",
    "Se non sei stato tu, ignora questa email: senza conferma non ti scriviamo. In ogni email trovi il link per cancellarti.",
  ].join("\n");

  return { to: input.to, subject, html, text, idempotencyKey: `gd-newsletter-confirm-${input.token}-${new Date().toISOString().slice(0, 10)}` };
}
