import { describe, expect, it } from "vitest";
import { GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID, reviewOptIn } from "@/lib/customer-reviews";
import { addWorkingDays, availabilityDate } from "@/lib/merchant-availability";
import type { CheckoutSessionSummary } from "@/lib/payments/stripe-checkout";

// Wednesday 14 October 2026, late evening in Italy.
const NOW = new Date("2026-10-14T20:30:00Z");

const paid = (overrides: Partial<CheckoutSessionSummary> = {}): CheckoutSessionSummary => ({
  status: "complete",
  paymentStatus: "paid",
  reference: "GD-ABCDEFGH",
  totalCents: 3040,
  email: "mario.rossi@email.it",
  shippingCents: 565,
  lines: [{ slug: "soar-phoenix-9-60gf", quantity: 1 }],
  preorderSlugs: [],
  ...overrides,
});

describe("working days", () => {
  it("skip the weekend", () => {
    expect(addWorkingDays(NOW, 5).toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(addWorkingDays(new Date("2026-10-16T09:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-10-19"); // Fri → Mon
  });

  it("leave the Merchant feed's availability dates as they were", () => {
    expect(availabilityDate({ releasePreorder: true }, NOW)).toBe("2026-11-11T00:00:00Z");
    expect(availabilityDate({}, NOW)).toBe("2026-11-04T00:00:00Z");
  });
});

describe("the Google Customer Reviews survey offer", () => {
  it("describes a paid order the way Google's opt-in expects it", () => {
    expect(reviewOptIn(paid(), NOW)).toEqual({
      merchant_id: GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID,
      order_id: "GD-ABCDEFGH",
      email: "mario.rossi@email.it",
      delivery_country: "IT",
      estimated_delivery_date: "2026-10-21",
      opt_in_style: "CENTER_DIALOG",
    });
    expect(GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID).toBe(5871189763);
  });

  it("waits for a pre-order to arrive before Google asks about it", () => {
    expect(reviewOptIn(paid({ preorderSlugs: ["glory-valkerion-lf"] }), NOW)?.estimated_delivery_date).toBe("2026-11-11");
    // A piece waiting for the Hasbro release takes longest.
    expect(reviewOptIn(paid({ preorderSlugs: ["mirage-clock-9-65b"] }), NOW)?.estimated_delivery_date).toBe("2026-11-18");
  });

  it("is not offered for an order that cannot be surveyed", () => {
    expect(reviewOptIn(paid({ paymentStatus: "unpaid" }), NOW)).toBeNull();
    expect(reviewOptIn(paid({ status: "open" }), NOW)).toBeNull();
    expect(reviewOptIn(paid({ email: null }), NOW)).toBeNull();
    expect(reviewOptIn(paid({ email: "  " }), NOW)).toBeNull();
    expect(reviewOptIn(paid({ reference: null }), NOW)).toBeNull();
  });

  it("treats a summary without pre-order information as in stock", () => {
    const withoutPreorders: CheckoutSessionSummary = { ...paid() };
    delete (withoutPreorders as { preorderSlugs?: readonly string[] }).preorderSlugs;
    expect(reviewOptIn(withoutPreorders, NOW)?.estimated_delivery_date).toBe("2026-10-21");
  });
});
