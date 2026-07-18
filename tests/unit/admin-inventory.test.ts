import { describe, expect, it } from "vitest";
import { inventoryAdjustmentSchema } from "@/lib/admin/inventory";

describe("admin inventory contracts", () => {
  it("accepts only manual inventory reasons and non-zero bounded deltas", () => {
    expect(inventoryAdjustmentSchema.safeParse({
      sku: "bx-01",
      delta: 5,
      reason: "manual_adjustment",
      note: "Conteggio scaffale",
      confirmReduction: false,
    }).success).toBe(true);
    expect(inventoryAdjustmentSchema.safeParse({ sku: "bx-01", delta: 0, reason: "manual_adjustment", note: "" }).success).toBe(false);
    expect(inventoryAdjustmentSchema.safeParse({ sku: "bx-01", delta: 1, reason: "order_reserved", note: "" }).success).toBe(false);
    expect(inventoryAdjustmentSchema.safeParse({ sku: "bx-01", delta: 100_001, reason: "return", note: "" }).success).toBe(false);
  });

  it("requires explicit confirmation for reductions of ten or more", () => {
    const reduction = { sku: "bx-01", delta: -10, reason: "damage", note: "Danneggiati" };
    expect(inventoryAdjustmentSchema.safeParse({ ...reduction, confirmReduction: false }).success).toBe(false);
    expect(inventoryAdjustmentSchema.safeParse({ ...reduction, confirmReduction: true }).success).toBe(true);
  });
});
