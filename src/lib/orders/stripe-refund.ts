import type { StripeEvent } from "@/lib/payments/stripe-webhook";

/**
 * A refund made on Stripe reaches the shop through the charge.refunded webhook. The charge in the
 * event carries the total refunded so far, so recording it can be repeated safely (see the
 * migration 20261105120000).
 */

export const CHARGE_REFUNDED_EVENT = "charge.refunded";

const SITE_REFUND_KEY_PREFIX = "gd-refund-";

/** The admin's "Rimborsa su Stripe" sends this key, and records the refund itself once Stripe answers. */
export function siteRefundKey(orderNumber: string, attempt: string): string {
  return `${SITE_REFUND_KEY_PREFIX}${orderNumber}-${attempt}`;
}

export type ChargeRefund = {
  readonly chargeId: string;
  readonly paymentIntentId: string;
  /** Everything refunded on this charge so far, not the last refund alone. */
  readonly amountRefundedCents: number;
  /** Set by our checkout: a charge with a reference belongs to an order of this shop. */
  readonly orderReference: string | null;
};

type ChargeObject = {
  readonly id?: unknown;
  readonly object?: unknown;
  readonly payment_intent?: unknown;
  readonly amount_refunded?: unknown;
  readonly metadata?: { readonly order_ref?: unknown } | null;
};

export function chargeRefundFromEvent(event: StripeEvent): ChargeRefund | null {
  if (event.type !== CHARGE_REFUNDED_EVENT) return null;
  const charge = event.data.object as ChargeObject;
  if (charge.object !== "charge" || typeof charge.id !== "string") return null;
  if (typeof charge.payment_intent !== "string" || !charge.payment_intent) return null;
  if (typeof charge.amount_refunded !== "number" || !Number.isInteger(charge.amount_refunded) || charge.amount_refunded <= 0) return null;
  const reference = charge.metadata?.order_ref;
  return {
    chargeId: charge.id,
    paymentIntentId: charge.payment_intent,
    amountRefundedCents: charge.amount_refunded,
    orderReference: typeof reference === "string" && reference.trim() ? reference.trim() : null,
  };
}

export type StoredRefund = { readonly orderId: number; readonly orderNumber: string; readonly refundedCents: number; readonly recorded: boolean };

export type RefundStore = {
  /** Null when no order has this payment. */
  record(refund: ChargeRefund): Promise<StoredRefund | null>;
};

export type RefundResult =
  | { readonly status: "ignored"; readonly reason: "site_refund" | "unreadable" | "not_an_order" }
  | { readonly status: "recorded"; readonly order: StoredRefund }
  | { readonly status: "failed"; readonly detail: string };

export async function processChargeRefund(event: StripeEvent, store: RefundStore): Promise<RefundResult> {
  if (event.request?.idempotency_key?.startsWith(SITE_REFUND_KEY_PREFIX)) return { status: "ignored", reason: "site_refund" };
  const refund = chargeRefundFromEvent(event);
  if (!refund) return { status: "ignored", reason: "unreadable" };
  try {
    const order = await store.record(refund);
    if (order) return { status: "recorded", order };
    // Our checkout made this charge but its order is not in yet: failing makes Stripe try again.
    if (refund.orderReference) return { status: "failed", detail: `order ${refund.orderReference} not recorded yet` };
    return { status: "ignored", reason: "not_an_order" };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "unknown error" };
  }
}
