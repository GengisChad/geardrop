import { button, emailShell, escapeHtml, paragraph } from "@/lib/email/template";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

/**
 * The owner's note when InPost says a parcel will not reach the buyer: it is coming back, or it
 * is lost. Magenta, the template's "needs a look"; internal footer, since only the shop reads it.
 */
export function inpostAlertEmail(order: { readonly id: number; readonly orderNumber: string; readonly trackingCode: string }, what: string, code: string) {
  const subject = `Pacco ${order.orderNumber}: ${what.toLowerCase()} · InPost`;
  const html = emailShell(
    subject,
    `${paragraph(`InPost segnala per l'ordine <strong>${escapeHtml(order.orderNumber)}</strong>: ${escapeHtml(what)} (${escapeHtml(code)}).`)}
    ${paragraph(`Tracking ${escapeHtml(order.trackingCode)}. Scrivi al cliente dal pannello ordini.`)}
    ${button("Apri l'ordine nel pannello", `${PRODUCTION_ORIGIN}/admin/ordini/${order.id}`, "alert")}`,
    { tone: "alert", kicker: `InPost · ${code}`, preheader: `${what}: tracking ${order.trackingCode}.`, footer: "internal" },
  );
  const text = `InPost segnala per l'ordine ${order.orderNumber}: ${what} (${code}). Tracking ${order.trackingCode}.`;
  return { subject, html, text };
}
