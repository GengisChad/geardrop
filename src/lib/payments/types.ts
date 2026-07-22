export type RefundPreparation = {
  readonly orderId: number;
  readonly amountCents: number;
  readonly reason: string;
};

export type PaymentOperationResult =
  | { readonly ok: true; readonly reference: string }
  | { readonly ok: false; readonly code: "PAYMENTS_NOT_CONFIGURED" | "PAYMENTS_NOT_IMPLEMENTED"; readonly message: string };

export interface PaymentAdapter {
  readonly name: "mock" | "stripe";
  prepareRefund(input: RefundPreparation): Promise<PaymentOperationResult>;
}
