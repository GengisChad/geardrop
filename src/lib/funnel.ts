/**
 * Anonymous funnel event tracking — client-side, fire-and-forget, no cookies, no identifiers.
 *
 * Events are sent to the `track_storefront_event` RPC which whitelists them server-side.
 * Bot requests (navigator.webdriver) are silently dropped.
 *
 * Allowed events (mirroring the SQL whitelist):
 *   product_view  — user lands on a product page
 *   add_to_cart   — a purchasable product is successfully added to the cart
 *   cart_view     — user views the cart page
 *   checkout_view — user views the checkout page
 *   checkout_submit — user submits the checkout form (before Stripe redirect)
 */

export type FunnelEvent =
  | "product_view"
  | "add_to_cart"
  | "cart_view"
  | "checkout_view"
  | "checkout_submit";

/** Fire-and-forget: swallow all errors so the funnel never blocks the buyer. */
export function trackEvent(event: FunnelEvent): void {
  // Skip headless browsers / bots
  if (typeof navigator !== "undefined" && navigator.webdriver) return;

  // POST to the Supabase RPC through the site's Next.js route so we never expose keys client-side
  fetch("/api/funnel/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    // keepalive lets the request survive page navigation
    keepalive: true,
  }).catch(() => {
    // intentionally silent — funnel events must not break the buyer flow
  });
}
