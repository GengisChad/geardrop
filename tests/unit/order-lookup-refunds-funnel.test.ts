import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFunnelSummary, type FunnelRow } from "@/lib/admin/dashboard";
import { refundStripeSchema } from "@/lib/admin/orders";
import { lookupOrderAction } from "@/app/(storefront)/ordine/actions";

// ─── Lookup action schema validation ─────────────────────────────────────────

describe("lookupOrderAction input validation", () => {
  it("rejects empty order number", async () => {
    const fd = new FormData();
    fd.append("orderNumber", "");
    fd.append("email", "buyer@example.com");
    const result = await lookupOrderAction(null, fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Non troviamo un ordine con questi dati.");
  });

  it("rejects invalid email", async () => {
    const fd = new FormData();
    fd.append("orderNumber", "GD-ABCDEF12");
    fd.append("email", "not-an-email");
    const result = await lookupOrderAction(null, fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Non troviamo un ordine con questi dati.");
  });

  it("returns a generic message when no order matches", async () => {
    // The test Supabase client returns null/empty — we only test the error path here.
    const fd = new FormData();
    fd.append("orderNumber", "GD-NOTFOUND0");
    fd.append("email", "buyer@example.com");
    const result = await lookupOrderAction(null, fd);
    // The result is ok: false because there's no real DB in unit tests.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Non troviamo un ordine con questi dati.");
  });
});

// ─── Stripe refund schema validation ─────────────────────────────────────────

describe("refundStripeSchema", () => {
  it("accepts valid full-refund input", () => {
    expect(
      refundStripeSchema.safeParse({
        orderId: "42",
        amountCents: 3490,
        reason: "Richiesta del cliente",
        confirmed: true,
        restoreStock: false,
      }).success,
    ).toBe(true);
  });

  it("rejects without confirmation", () => {
    expect(
      refundStripeSchema.safeParse({
        orderId: "42",
        amountCents: 3490,
        reason: "Richiesta del cliente",
        confirmed: false,
        restoreStock: false,
      }).success,
    ).toBe(false);
  });

  it("rejects zero amount", () => {
    expect(
      refundStripeSchema.safeParse({
        orderId: "42",
        amountCents: 0,
        reason: "Richiesta del cliente",
        confirmed: true,
        restoreStock: false,
      }).success,
    ).toBe(false);
  });

  it("rejects short reason", () => {
    expect(
      refundStripeSchema.safeParse({
        orderId: "42",
        amountCents: 1000,
        reason: "ab",
        confirmed: true,
        restoreStock: false,
      }).success,
    ).toBe(false);
  });
});

// ─── Funnel math ─────────────────────────────────────────────────────────────

describe("buildFunnelSummary", () => {
  const sampleRows: readonly FunnelRow[] = [
    { day: "2026-09-10", event: "product_view", count: 100 },
    { day: "2026-09-10", event: "add_to_cart", count: 40 },
    { day: "2026-09-10", event: "cart_view", count: 35 },
    { day: "2026-09-10", event: "checkout_view", count: 20 },
    { day: "2026-09-10", event: "checkout_submit", count: 10 },
    { day: "2026-09-11", event: "product_view", count: 50 },
    { day: "2026-09-11", event: "add_to_cart", count: 10 },
  ];

  it("aggregates totals across days", () => {
    const summary = buildFunnelSummary(sampleRows);
    const pdp = summary.find((s) => s.event === "product_view");
    const atc = summary.find((s) => s.event === "add_to_cart");
    expect(pdp?.count).toBe(150);
    expect(atc?.count).toBe(50);
  });

  it("first step has null conversion (no previous step)", () => {
    const summary = buildFunnelSummary(sampleRows);
    expect(summary[0]?.conversionFromPrev).toBeNull();
  });

  it("computes step-to-step conversion percentage", () => {
    const summary = buildFunnelSummary(sampleRows);
    // add_to_cart 50 / product_view 150 = 33%
    const atcStep = summary.find((s) => s.event === "add_to_cart");
    expect(atcStep?.conversionFromPrev).toBe(33);
  });

  it("returns 0% when step count is 0", () => {
    const sparse: readonly FunnelRow[] = [
      { day: "2026-09-10", event: "product_view", count: 100 },
    ];
    const summary = buildFunnelSummary(sparse);
    const atcStep = summary.find((s) => s.event === "add_to_cart");
    // add_to_cart count is 0, product_view > 0 → 0%
    expect(atcStep?.conversionFromPrev).toBe(0);
  });

  it("returns null% when previous step count is 0 (division guard)", () => {
    const sparse: readonly FunnelRow[] = [];
    const summary = buildFunnelSummary(sparse);
    // All counts are 0; every step after the first has prevCount === 0 → null
    summary.slice(1).forEach((step) => {
      expect(step.conversionFromPrev).toBeNull();
    });
  });

  it("produces exactly 5 steps in the canonical funnel order", () => {
    const summary = buildFunnelSummary(sampleRows);
    expect(summary).toHaveLength(5);
    expect(summary.map((s) => s.event)).toEqual([
      "product_view",
      "add_to_cart",
      "cart_view",
      "checkout_view",
      "checkout_submit",
    ]);
  });
});

// ─── Source-level contract checks ────────────────────────────────────────────

describe("order tracking page contract", () => {
  it("has noindex metadata", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(storefront)/ordine/page.tsx"),
      "utf8",
    );
    expect(source).toContain("index: false");
  });

  it("uses the lookup server action", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(storefront)/ordine/order-lookup-form.tsx"),
      "utf8",
    );
    expect(source).toContain("lookupOrderAction");
    expect(source).toContain("PREORDER_DELIVERY");
    expect(source).toContain("trackingLink");
  });

  it("footer has traccia-ordine link", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/navigation.ts"),
      "utf8",
    );
    expect(source).toContain("/ordine");
    expect(source).toContain("Traccia");
  });
});

describe("Stripe refund action contract", () => {
  it("action calls record_order_refund RPC and handles Stripe errors", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/admin/actions/orders.ts"),
      "utf8",
    );
    expect(source).toContain("record_order_refund");
    expect(source).toContain("refundStripeSchema.safeParse");
    expect(source).toContain("La chiave Stripe non ha il permesso per i rimborsi");
  });
});

describe("funnel tracking contract", () => {
  it("track_storefront_event is fired from add-to-cart button (one line)", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/product/add-to-cart-button.tsx"),
      "utf8",
    );
    expect(source).toContain("trackEvent(\"add_to_cart\")");
  });

  it("checkout_submit is fired from checkout client", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(storefront)/checkout/checkout-client.tsx"),
      "utf8",
    );
    expect(source).toContain("trackEvent(\"checkout_submit\")");
  });

  it("product_view is fired from PDP", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(storefront)/prodotto/[slug]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("product_view");
  });

  it("API route whitelists events", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/funnel/track/route.ts"),
      "utf8",
    );
    expect(source).toContain("product_view");
    expect(source).toContain("add_to_cart");
    expect(source).toContain("checkout_submit");
  });
});
