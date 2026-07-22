import { afterEach, describe, expect, it } from "vitest";
import { MockPaymentAdapter } from "@/lib/payments/mock-adapter";
import { getPaymentAdapter } from "@/lib/payments/provider";
import { StripePaymentAdapter } from "@/lib/payments/stripe-adapter";

afterEach(() => {
  delete process.env.PAYMENTS_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("payment adapter boundary", () => {
  it("selects mock by default", () => {
    expect(getPaymentAdapter()).toBeInstanceOf(MockPaymentAdapter);
  });

  it("never selects Stripe without explicit configuration", () => {
    process.env.PAYMENTS_PROVIDER = "stripe";
    expect(getPaymentAdapter()).toBeInstanceOf(StripePaymentAdapter);
  });

  it("returns a stable disabled result and performs no network call without secrets", async () => {
    const adapter = new StripePaymentAdapter({ secretKey: undefined });
    await expect(adapter.prepareRefund({ orderId: 1, amountCents: 500, reason: "Test" })).resolves.toEqual({
      ok: false,
      code: "PAYMENTS_NOT_CONFIGURED",
      message: "Pagamenti Stripe non configurati.",
    });
  });
});
