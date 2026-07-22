import { MockPaymentAdapter } from "./mock-adapter";
import { StripePaymentAdapter } from "./stripe-adapter";
import type { PaymentAdapter } from "./types";

export function getPaymentAdapter(): PaymentAdapter {
  if (process.env.PAYMENTS_PROVIDER === "stripe") {
    return new StripePaymentAdapter({ secretKey: process.env.STRIPE_SECRET_KEY });
  }
  return new MockPaymentAdapter();
}
