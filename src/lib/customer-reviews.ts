import { isReleasePreorder } from "@/lib/commerce/release-preorder";
import { addWorkingDays } from "@/lib/merchant-availability";
import type { CheckoutSessionSummary } from "@/lib/payments/stripe-checkout";

/**
 * Google Customer Reviews: after delivery Google emails the buyer a short survey about the shop.
 * The answers become the store rating in Merchant Center and, with enough of them, the stars on
 * Shopping ads.
 *
 * The survey is opt-in twice over. The order page offers it with our own button, and only that
 * click loads Google's script — nothing from Google reaches a buyer who does not ask for it.
 * Google's dialog then asks for consent again in its own words.
 */
export const GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID = 5871189763;

/**
 * Working days until the parcel is in the buyer's hands: the far end of what the shop promises
 * (src/lib/labels.ts), with the 1–5 days of the carrier added to a pre-order's wait. Google sends
 * the survey after this date, so a date that is too early asks for a review of a parcel that has
 * not arrived yet.
 */
const IN_STOCK_DAYS = 5;
const PREORDER_DAYS = 15 + 5;
const RELEASE_DAYS = 20 + 5;

/** What gapi.surveyoptin.render() takes, field for field. */
export type ReviewOptIn = {
  readonly merchant_id: number;
  readonly order_id: string;
  readonly email: string;
  readonly delivery_country: "IT";
  /** YYYY-MM-DD. */
  readonly estimated_delivery_date: string;
  readonly opt_in_style: "CENTER_DIALOG";
};

/** The survey offer for a paid order, or null when the order cannot be surveyed. */
export function reviewOptIn(session: CheckoutSessionSummary, now: Date = new Date()): ReviewOptIn | null {
  if (session.status !== "complete" || session.paymentStatus === "unpaid") return null;
  const email = session.email?.trim();
  if (!session.reference || !email) return null;

  const preordered = session.preorderSlugs ?? [];
  const days = preordered.some((slug) => isReleasePreorder(slug))
    ? RELEASE_DAYS
    : preordered.length > 0
      ? PREORDER_DAYS
      : IN_STOCK_DAYS;

  return {
    merchant_id: GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID,
    order_id: session.reference,
    email,
    delivery_country: "IT",
    estimated_delivery_date: addWorkingDays(now, days).toISOString().slice(0, 10),
    opt_in_style: "CENTER_DIALOG",
  };
}
