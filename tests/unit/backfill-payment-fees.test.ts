import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { backfillPaymentFees, parseLimit, type PendingOrder } from "../../scripts/backfill-payment-fees";
import type { StripeClient } from "@/lib/payments/stripe-api";

const orders: readonly PendingOrder[] = [
  { id: 1, order_number: "GD-00000001", total_cents: 3000, stripe_payment_intent_id: "pi_settled" },
  { id: 2, order_number: "GD-00000002", total_cents: 2000, stripe_payment_intent_id: "pi_pending" },
  { id: 3, order_number: "GD-00000003", total_cents: 1000, stripe_payment_intent_id: null },
];

function supabaseStub() {
  const filters: string[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "is", "order"]) {
    builder[method] = (...args: unknown[]) => {
      filters.push(`${method}:${args.map((value) => JSON.stringify(value)).join(",")}`);
      return builder;
    };
  }
  builder["limit"] = async () => ({ data: orders, error: null });
  return { client: { from: () => builder, rpc } as never, rpc, filters };
}

/** Stripe: one payment settled, one not, and the intents are fetched with their charge expanded. */
function stripeStub(): StripeClient & { get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (path: string) =>
    path.includes("pi_settled")
      ? { latest_charge: { balance_transaction: { fee: 87, currency: "eur" } } }
      : { latest_charge: { balance_transaction: null } },
  );
  return { get, post: vi.fn() } as unknown as StripeClient & { get: ReturnType<typeof vi.fn> };
}

describe("backfillPaymentFees", () => {
  it("asks only for paid orders that still have no fee", async () => {
    const { client, filters } = supabaseStub();
    await backfillPaymentFees(client, stripeStub(), { limit: 10, apply: false });
    expect(filters).toContain('in:"payment_status",["paid","refunded"]');
    expect(filters).toContain('is:"payment_fee_cents",null');
  });

  it("writes nothing without --apply and reports what it would do", async () => {
    const { client, rpc } = supabaseStub();
    const report = await backfillPaymentFees(client, stripeStub(), { limit: 10, apply: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(report.filled).toEqual([{ orderNumber: "GD-00000001", feeCents: 87 }]);
    expect(report.unsettled).toEqual(["GD-00000002"]);
    expect(report.withoutPayment).toEqual(["GD-00000003"]);
    expect(report.failed).toEqual([]);
  });

  it("writes each settled fee through the webhook's own function", async () => {
    const { client, rpc } = supabaseStub();
    await backfillPaymentFees(client, stripeStub(), { limit: 10, apply: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_order_payment_fee", { p_order_id: 1, p_fee_cents: 87 });
  });

  it("keeps going when one order fails and ends in error", async () => {
    const { client } = supabaseStub();
    const stripe = stripeStub();
    stripe.get.mockImplementation(async (path: string) => {
      if (path.includes("pi_settled")) throw new Error("Stripe 500");
      return { latest_charge: { balance_transaction: null } };
    });
    const report = await backfillPaymentFees(client, stripe, { limit: 10, apply: true });
    expect(report.failed).toEqual([{ orderNumber: "GD-00000001", reason: "Stripe 500" }]);
    expect(report.unsettled).toEqual(["GD-00000002"]);
  });
});

describe("parseLimit", () => {
  it("reads --limit within bounds and falls back otherwise", () => {
    expect(parseLimit(["--limit", "50"])).toBe(50);
    expect(parseLimit([])).toBe(200);
    expect(parseLimit(["--limit", "0"])).toBe(200);
    expect(parseLimit(["--limit", "9999"])).toBe(200);
  });
});
