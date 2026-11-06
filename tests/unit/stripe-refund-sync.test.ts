import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { chargeRefundFromEvent, processChargeRefund, siteRefundKey, type RefundStore } from "@/lib/orders/stripe-refund";
import { parseStripeEvent, type StripeEvent } from "@/lib/payments/stripe-webhook";

/** The fields of a real charge.refunded event, read on the Stripe dashboard (GD-S7N2X32S, 22/10). */
function refundEvent(overrides: Record<string, unknown> = {}, request: StripeEvent["request"] = null): StripeEvent {
  const event = parseStripeEvent(
    JSON.stringify({
      id: "evt_3UTNYWCy8uWigKLW1XlQTYL8",
      object: "event",
      type: "charge.refunded",
      request,
      data: {
        object: {
          id: "ch_3UTNYWCy8uWigKLW1iKbq9Fn",
          object: "charge",
          amount: 2064,
          amount_captured: 2064,
          amount_refunded: 2064,
          refunded: true,
          payment_intent: "pi_3UTNYWCy8uWigKLW12JcMoHg",
          metadata: { order_ref: "GD-S7N2X32S" },
          ...overrides,
        },
        previous_attributes: { amount_refunded: 0 },
      },
    }),
  );
  if (!event) throw new Error("fixture is not an event");
  return event;
}

function storeWith(answer: Awaited<ReturnType<RefundStore["record"]>>) {
  const record = vi.fn(async () => answer);
  return { record } satisfies RefundStore;
}

const stored = { orderId: 97, orderNumber: "GD-S7N2X32S", refundedCents: 2064, recorded: true };

describe("reading a charge.refunded event", () => {
  it("takes the payment, the total refunded so far and the order reference", () => {
    expect(chargeRefundFromEvent(refundEvent())).toEqual({
      chargeId: "ch_3UTNYWCy8uWigKLW1iKbq9Fn",
      paymentIntentId: "pi_3UTNYWCy8uWigKLW12JcMoHg",
      amountRefundedCents: 2064,
      orderReference: "GD-S7N2X32S",
    });
  });

  it("refuses other events and charges it cannot read", () => {
    expect(chargeRefundFromEvent({ ...refundEvent(), type: "charge.updated" })).toBeNull();
    expect(chargeRefundFromEvent(refundEvent({ object: "refund" }))).toBeNull();
    expect(chargeRefundFromEvent(refundEvent({ payment_intent: null }))).toBeNull();
    expect(chargeRefundFromEvent(refundEvent({ amount_refunded: 0 }))).toBeNull();
    expect(chargeRefundFromEvent(refundEvent({ amount_refunded: "2064" }))).toBeNull();
  });

  it("reads a charge without an order reference", () => {
    expect(chargeRefundFromEvent(refundEvent({ metadata: {} }))?.orderReference).toBeNull();
    expect(chargeRefundFromEvent(refundEvent({ metadata: null }))?.orderReference).toBeNull();
  });
});

describe("processing a refund from Stripe", () => {
  it("records a refund made from the dashboard", async () => {
    const store = storeWith(stored);
    await expect(processChargeRefund(refundEvent(), store)).resolves.toEqual({ status: "recorded", order: stored });
    expect(store.record).toHaveBeenCalledTimes(1);
  });

  it("leaves the refunds of the site's own button to that button, which records them itself", async () => {
    const store = storeWith(stored);
    const event = refundEvent({}, { id: "req_1", idempotency_key: siteRefundKey("GD-S7N2X32S", "attempt-1") });
    await expect(processChargeRefund(event, store)).resolves.toEqual({ status: "ignored", reason: "site_refund" });
    expect(store.record).not.toHaveBeenCalled();
  });

  it("records a dashboard request that carries an idempotency key of its own", async () => {
    const store = storeWith(stored);
    const event = refundEvent({}, { id: "req_2", idempotency_key: "dashboard-generated-key" });
    await expect(processChargeRefund(event, store)).resolves.toEqual({ status: "recorded", order: stored });
  });

  it("ignores a payment that is not a shop order, such as the owner's own test", async () => {
    const event = refundEvent({ metadata: {} });
    await expect(processChargeRefund(event, storeWith(null))).resolves.toEqual({ status: "ignored", reason: "not_an_order" });
  });

  it("fails so Stripe retries when the order of this charge has not been recorded yet", async () => {
    const result = await processChargeRefund(refundEvent(), storeWith(null));
    expect(result.status).toBe("failed");
  });

  it("fails so Stripe retries when the database does not answer", async () => {
    const store: RefundStore = {
      async record() {
        throw new Error("record_stripe_charge_refund: connection lost");
      },
    };
    await expect(processChargeRefund(refundEvent(), store)).resolves.toEqual({
      status: "failed",
      detail: "record_stripe_charge_refund: connection lost",
    });
  });
});

describe("the wiring around the refund event", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the webhook route handles the event and the admin button marks its own refunds", () => {
    expect(read("src/app/api/stripe/webhook/route.ts")).toContain("processChargeRefund");
    expect(read("src/app/admin/actions/orders.ts")).toContain("siteRefundKey(order.order_number, parsed.data.attempt)");
  });

  it("a refunded order that has not left cannot be shipped from the panel", () => {
    expect(read("src/components/admin/orders/order-actions.tsx")).toContain('paymentStatus !== "refunded"');
    expect(read("src/app/admin/actions/orders.ts")).toContain("Ordine rimborsato: non va spedito.");
  });

  it("only the webhook's key can call the database function", () => {
    const migration = read("supabase/migrations/20261105120000_record_stripe_charge_refund.sql");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to service_role;");
  });
});
