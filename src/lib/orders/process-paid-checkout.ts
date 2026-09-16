import { orderNotificationRecipient, SHOP_EMAIL, type EmailMessage, type EmailResult } from "@/lib/email/resend";
import { customerOrderEmail, ownerOrderEmail } from "./order-email";
import type { PaidCheckout } from "./stripe-order";

/**
 * What happens when Stripe confirms a paid checkout: record the order (which also takes the
 * stock), then tell the owner. Every step is safe to repeat, so a failure answers Stripe with
 * an error and Stripe's retry finishes the job without duplicating the order or the email.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type StoredOrder = { readonly id: number; readonly orderNumber: string; readonly created: boolean };

export type OrderStore = {
  record(checkout: PaidCheckout): Promise<StoredOrder>;
  ownerNotified(orderId: number): Promise<boolean>;
  markOwnerNotified(orderId: number): Promise<void>;
};

export type ProcessDependencies = {
  readonly loadCheckout: (sessionId: string) => Promise<PaidCheckout | null>;
  readonly store: OrderStore;
  readonly sendEmail: (message: EmailMessage) => Promise<EmailResult>;
  readonly env?: Env;
};

export type ProcessResult =
  | { readonly status: "ignored" }
  | {
      readonly status: "recorded";
      readonly order: StoredOrder;
      readonly ownerEmail: "sent" | "already_sent" | "not_configured";
    }
  | { readonly status: "failed"; readonly step: "load" | "record" | "notify"; readonly detail: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function processPaidCheckout(sessionId: string, deps: ProcessDependencies): Promise<ProcessResult> {
  const env = deps.env ?? process.env;

  let checkout: PaidCheckout | null;
  try {
    checkout = await deps.loadCheckout(sessionId);
  } catch (error) {
    return { status: "failed", step: "load", detail: message(error) };
  }
  // Not paid yet (a delayed payment method) or not one of the shop's checkouts.
  if (!checkout) return { status: "ignored" };

  let order: StoredOrder;
  try {
    order = await deps.store.record(checkout);
  } catch (error) {
    return { status: "failed", step: "record", detail: message(error) };
  }

  let ownerEmail: "sent" | "already_sent" | "not_configured";
  try {
    if (await deps.store.ownerNotified(order.id)) {
      ownerEmail = "already_sent";
    } else {
      const content = ownerOrderEmail(checkout, order);
      const sent = await deps.sendEmail({
        to: orderNotificationRecipient(env),
        replyTo: checkout.email,
        idempotencyKey: `gd-order-owner-${order.id}`,
        ...content,
      });
      if (sent.ok) {
        await deps.store.markOwnerNotified(order.id);
        ownerEmail = "sent";
      } else if (sent.reason === "not_configured") {
        // The order is safe in the admin panel; without an email key there is nothing to retry.
        ownerEmail = "not_configured";
      } else {
        return { status: "failed", step: "notify", detail: sent.detail ?? sent.reason };
      }
    }
  } catch (error) {
    return { status: "failed", step: "notify", detail: message(error) };
  }

  // The buyer's own confirmation needs a verified sending domain, so it is opt-in. Stripe
  // already sends the payment receipt; a failure here never holds the order back.
  if (order.created && env["ORDER_CUSTOMER_EMAILS"] === "true") {
    try {
      const content = customerOrderEmail(checkout, order);
      const sent = await deps.sendEmail({
        to: checkout.email,
        replyTo: SHOP_EMAIL,
        idempotencyKey: `gd-order-customer-${order.id}`,
        ...content,
      });
      if (!sent.ok) console.error("[orders] customer confirmation not sent:", sent.reason, sent.detail ?? "");
    } catch (error) {
      console.error("[orders] customer confirmation not sent:", message(error));
    }
  }

  return { status: "recorded", order, ownerEmail };
}
