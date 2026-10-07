import { emailShell, escapeHtml } from "@/lib/orders/order-email";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { OwnerNotice } from "./process-inbound";

/**
 * What the owner hears from the Vinted sync. A sale the shop recorded alone needs no email —
 * Vinted already sent one — so only two things reach the inbox: a sale that waits for the owner
 * to say which pieces left, and Google's code for confirming the Gmail forwarding, once.
 */

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function ownerNoticeEmail(notice: OwnerNotice, catalogueNames: ReadonlyMap<string, string>) {
  const panel = `${PRODUCTION_ORIGIN}/admin/vinted`;

  if (notice.kind === "forwarding-check") {
    const subject = `Vinted · conferma l'inoltro Gmail: ${notice.subject}`.slice(0, 200);
    const html = emailShell(
      "Conferma l'inoltro da Gmail",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Google ha mandato all'indirizzo delle vendite Vinted l'email per confermare l'inoltro. Ecco il testo: usa il codice o il link per completare l'impostazione in Gmail.</p>
      <div style="font-size:14px;line-height:1.5;white-space:pre-line;border-left:3px solid #c6ff00;padding-left:12px">${escapeHtml(notice.text)}</div>`,
    );
    const text = ["Google ha mandato l'email per confermare l'inoltro Gmail:", "", notice.text].join("\n");
    return { subject, html, text, idempotencyKey: undefined };
  }

  const { sale, suggestion } = notice;
  const proposal = suggestion.lines.map((line) => `${line.quantity} × ${catalogueNames.get(line.slug) ?? line.slug}`);
  const why = notice.verified
    ? suggestion.reason
    : `${suggestion.reason} L'email non risulta firmata da Vinted, quindi il magazzino non è stato toccato.`;
  const subject = `Vendita Vinted da confermare: ${sale.listingTitle} (${euro.format(sale.amountCents / 100)})`.slice(0, 200);
  const html = emailShell(
    "Vendita Vinted da confermare",
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><strong>${escapeHtml(sale.listingTitle)}</strong> · ${escapeHtml(euro.format(sale.amountCents / 100))}</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(why)}</p>
    ${proposal.length ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">Proposta: ${proposal.map(escapeHtml).join(", ")}</p>` : ""}
    <p style="margin:16px 0 0;font-size:15px"><a href="${panel}" style="color:#c6ff00">Apri il pannello e conferma i pezzi</a></p>`,
  );
  const text = [
    `Vendita Vinted da confermare: ${sale.listingTitle} (${euro.format(sale.amountCents / 100)})`,
    why,
    proposal.length ? `Proposta: ${proposal.join(", ")}` : "",
    `Conferma i pezzi: ${panel}`,
  ].filter(Boolean).join("\n");
  return { subject, html, text, idempotencyKey: `gd-vinted-pending-${notice.saleId}` };
}
