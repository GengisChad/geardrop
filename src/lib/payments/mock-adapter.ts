import type { PaymentAdapter, PaymentOperationResult, RefundPreparation } from "./types";

export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = "mock" as const;

  async prepareRefund(input: RefundPreparation): Promise<PaymentOperationResult> {
    return { ok: true, reference: `mock-refund-${input.orderId}` };
  }
}
