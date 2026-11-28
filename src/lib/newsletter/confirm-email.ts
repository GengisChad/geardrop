import type { EmailMessage } from "@/lib/email/resend";
import { newsletterConfirmUrl } from "@/lib/newsletter/newsletter";
import { button, emailShell, note, paragraph } from "@/lib/email/template";
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
    `${paragraph("Hai chiesto di ricevere le novità di GEAR//DROP: arrivi e riassortimenti dei Beyblade X. Questo è solo il primo drop.")}
    ${button("Conferma l'iscrizione", url, "incoming")}
    ${note("Se non sei stato tu, ignora questa email: senza conferma non ti scriviamo. In ogni email trovi il link per cancellarti.")}`,
    { tone: "incoming", kicker: "Novità in arrivo", preheader: "Un tocco per confermare: poi ti scriviamo solo arrivi e riassortimenti." },
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
