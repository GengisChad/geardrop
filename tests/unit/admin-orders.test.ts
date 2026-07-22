import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedOrderTransitions,
  csvOrderCell,
  normalizeAdminOrderQuery,
  orderPiiVisibility,
  refundPreparationSchema,
  trackingSchema,
} from "@/lib/admin/orders";

describe("admin orders", () => {
  it("normalizes bounded list filters and pagination", () => {
    expect(normalizeAdminOrderQuery({
      q: "  GD-0001@example.com  ", from: "2026-07-01", to: "2026-07-31",
      status: "shipped", payment: "paid", shipping: "express", coupon: " summer ",
      page: "-2", pageSize: "999",
    })).toEqual({
      q: "GD-0001@example.com", from: "2026-07-01", to: "2026-07-31",
      status: "shipped", payment: "paid", shipping: "express", coupon: "SUMMER",
      page: 1, pageSize: 100,
    });
  });

  it("falls back safely for invalid filters", () => {
    expect(normalizeAdminOrderQuery({ status: "deleted", payment: "cash", from: "2026-99-99", to: "never" })).toMatchObject({
      status: "all", payment: "all", from: null, to: null, page: 1, pageSize: 25,
    });
  });

  it("limits PII and exports to managers", () => {
    expect(orderPiiVisibility("owner")).toEqual({ view: true, export: true });
    expect(orderPiiVisibility("admin")).toEqual({ view: true, export: true });
    expect(orderPiiVisibility("editor")).toEqual({ view: false, export: false });
  });

  it("prevents spreadsheet formulas in CSV", () => {
    expect(csvOrderCell("=WEBSERVICE(\"x\")")).toBe("\"'=WEBSERVICE(\"\"x\"\")\"");
    expect(csvOrderCell("customer@example.com")).toBe("\"customer@example.com\"");
  });

  it("validates tracking and refund preparation", () => {
    expect(trackingSchema.safeParse({ orderId: 1, carrier: "GLS", code: "ABC-1", url: "https://example.com/a" }).success).toBe(true);
    expect(trackingSchema.safeParse({ orderId: 1, carrier: "GLS", code: "ABC-1", url: "javascript:alert(1)" }).success).toBe(false);
    expect(refundPreparationSchema.safeParse({ orderId: 1, amountCents: 500, reason: "Richiesta cliente" }).success).toBe(true);
    expect(refundPreparationSchema.safeParse({ orderId: 1, amountCents: 0, reason: "" }).success).toBe(false);
  });

  it("exposes only legal forward transitions", () => {
    expect(allowedOrderTransitions("pending")).toEqual(["confirmed", "cancelled"]);
    expect(allowedOrderTransitions("processing")).toEqual(["shipped", "cancelled"]);
    expect(allowedOrderTransitions("completed")).toEqual([]);
  });

  it("routes every mutation through validated lifecycle RPC actions", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/actions/orders.ts"), "utf8");
    for (const schema of ["orderTransitionSchema", "orderCancellationSchema", "trackingSchema", "orderNoteSchema", "refundPreparationSchema"]) expect(source).toContain(`${schema}.safeParse`);
    for (const rpc of ["transition_order_status", "cancel_order_and_restore_stock", "set_order_tracking", "add_order_note", "prepare_order_refund"]) expect(source).toContain(`rpc(\"${rpc}\"`);
    expect(source).toContain("requireStaffRole");
  });

  it("renders immutable snapshots without exposing raw JSON", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/(protected)/ordini/[id]/page.tsx"), "utf8");
    for (const field of ["product_name_snapshot", "sku_snapshot", "unit_price_cents", "line_total_cents", "shipping_address_snapshot", "billing_address_snapshot"]) expect(source).toContain(field);
    expect(source).toContain("addressLines");
    expect(source).not.toContain("JSON.stringify");
  });

  it("protects order export and uses safe CSV cells", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/(protected)/ordini/export/route.ts"), "utf8");
    expect(source).toContain("orderPiiVisibility");
    expect(source).toContain("status: 403");
    expect(source).toContain("csvOrderCell");
  });
});
