import type { StripeClient } from "@/lib/payments/stripe-api";

type BalanceTransaction = { readonly fee?: unknown; readonly currency?: unknown };
type Charge = { readonly balance_transaction?: BalanceTransaction | string | null };
type PaymentIntent = { readonly latest_charge?: Charge | string | null };

/**
 * The fee Stripe kept on a payment, in euro cents, read from the balance transaction of the
 * payment intent's charge. Null while Stripe has not settled it yet (the transaction is not
 * there) or when it is not in euro: the order's profit then stays incomplete instead of guessed.
 */
export async function stripePaymentFee(stripe: StripeClient, paymentIntentId: string): Promise<number | null> {
  const intent = await stripe.get<PaymentIntent>(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
  );
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const transaction = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  if (!transaction || transaction.currency !== "eur") return null;
  return typeof transaction.fee === "number" && Number.isSafeInteger(transaction.fee) && transaction.fee >= 0
    ? transaction.fee
    : null;
}
