/**
 * Payment configuration.
 *
 * For now GEAR//DROP accepts one method only: PayPal.Me. The customer places the order,
 * then pays by opening a PayPal.Me link prefilled with the order total and writes the order
 * number in the PayPal note, so the payment can be matched by hand. There is no card / PSP
 * integration yet.
 *
 * Set `handle` to GEAR//DROP's PayPal.Me username — the part after `paypal.me/`. While it
 * is empty the checkout still works but shows a "we'll send you the link" fallback instead
 * of a pay button, so a link is never built against a wrong or empty handle.
 */
export const PAYPAL_ME = {
  /** paypal.me/<handle> */
  handle: "federicosangroyal",
} as const;

/**
 * WhatsApp fallback for delivering the order to the merchant when there is no backend.
 * Number in international digits-only form (no `+`), as wa.me requires: 39 + the number.
 */
export const WHATSAPP = {
  /** +39 327 279 3278 */
  number: "393272793278",
} as const;

/** wa.me link that opens a chat to the merchant prefilled with `text`. */
export function whatsappLink(text: string): string {
  return `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(text)}`;
}

/**
 * PayPal.Me link prefilled with an amount in EUR, or `null` when no handle is configured.
 * Format follows the one the Gear Sports Italia app uses: `paypal.me/<handle>/<amount>`.
 */
export function paypalMeLink(amountCents: number): string | null {
  if (!PAYPAL_ME.handle) return null;
  return `https://paypal.me/${PAYPAL_ME.handle}/${(amountCents / 100).toFixed(2)}EUR`;
}
