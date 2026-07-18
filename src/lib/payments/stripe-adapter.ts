import type { PaymentAdapter, PaymentOperationResult, RefundPreparation } from "./types";

type StripePaymentAdapterOptions = { readonly secretKey?: string | undefined };

export class StripePaymentAdapter implements PaymentAdapter {
  readonly name = "stripe" as const;
  private readonly secretKey: string | undefined;

  constructor(options: StripePaymentAdapterOptions = {}) {
    this.secretKey = options.secretKey;
  }

  async prepareRefund(_input: RefundPreparation): Promise<PaymentOperationResult> {
    if (!this.secretKey) {
      return { ok: false, code: "PAYMENTS_NOT_CONFIGURED", message: "Pagamenti Stripe non configurati." };
    }
    return { ok: false, code: "PAYMENTS_NOT_IMPLEMENTED", message: "Rimborso Stripe non ancora attivato." };
  }
}
