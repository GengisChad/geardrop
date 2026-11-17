import { describe, expect, it, vi } from "vitest";
import {
  allocateLandedCosts,
  formatEuro,
  formatEuroInput,
  marginPercent,
  netOfVat,
  parseCostImport,
  parseEuroCents,
  receiptDraftSchema,
  supplierSchema,
} from "@/lib/admin/warehouse";
import { stripePaymentFee } from "@/lib/orders/payment-fee";
import type { StripeClient } from "@/lib/payments/stripe-api";

describe("parseEuroCents", () => {
  it.each([
    ["6,50", 650],
    ["6.5", 650],
    ["6", 600],
    ["€ 14,00", 1400],
    ["1.234,56", 123456],
    ["0,05", 5],
  ])("reads %s as %i cents", (typed, cents) => {
    expect(parseEuroCents(typed)).toBe(cents);
  });

  it.each(["", "abc", "-3", "6,555", "1.234", "1,2,3"])("refuses %j instead of guessing", (typed) => {
    expect(parseEuroCents(typed)).toBeNull();
  });

  it("round-trips through the form value", () => {
    expect(formatEuroInput(650)).toBe("6,50");
    expect(parseEuroCents(formatEuroInput(123456))).toBe(123456);
    expect(formatEuroInput(null)).toBe("");
  });
});

describe("allocateLandedCosts", () => {
  it("spreads freight by line value, the last line taking the rounding, like the database", () => {
    const landed = allocateLandedCosts([{ quantity: 10, unitCostCents: 650 }, { quantity: 4, unitCostCents: 650 }], 700);
    expect(landed).toEqual([
      { allocatedCents: 500, landedTotalCents: 7000, landedUnitCostCents: 700 },
      { allocatedCents: 200, landedTotalCents: 2800, landedUnitCostCents: 700 },
    ]);
  });

  it("adds up exactly to the document whatever the rounding", () => {
    const lines = [{ quantity: 3, unitCostCents: 333 }, { quantity: 7, unitCostCents: 101 }, { quantity: 1, unitCostCents: 999 }];
    const landed = allocateLandedCosts(lines, 1001);
    const goods = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    expect(landed.reduce((sum, line) => sum + line.landedTotalCents, 0)).toBe(goods + 1001);
  });

  it("spreads by quantity when nothing has a value (free samples)", () => {
    const landed = allocateLandedCosts([{ quantity: 1, unitCostCents: 0 }, { quantity: 3, unitCostCents: 0 }], 400);
    expect(landed.map((line) => line.allocatedCents)).toEqual([100, 300]);
  });
});

describe("profit arithmetic", () => {
  it("takes VAT out of a gross price as order_profit does", () => {
    expect(netOfVat(3000, 2200)).toBe(2459);
    expect(netOfVat(1450, 2200)).toBe(1189);
    expect(netOfVat(1000, 0)).toBe(1000);
  });

  it("computes the margin on the net price", () => {
    expect(marginPercent(1189, 650)).toBe(45.3);
    expect(marginPercent(1000, 1200)).toBe(-20);
    expect(marginPercent(1000, null)).toBeNull();
  });

  it("formats euro amounts with a real minus", () => {
    expect(formatEuro(389)).toBe("€3,89");
    expect(formatEuro(-389)).toBe("−€3,89");
    expect(formatEuro(123456)).toBe("€1.234,56");
    expect(formatEuro(null)).toBe("—");
  });
});

describe("warehouse schemas", () => {
  it("normalises a supplier and refuses a malformed one", () => {
    expect(supplierSchema.parse({
      name: " Distribuidora ", countryCode: "es", vatNumber: "", vatRegime: "intra_ue", email: "", notes: "", active: true,
    })).toMatchObject({ name: "Distribuidora", countryCode: "ES", vatNumber: null, email: null, notes: null });
    expect(supplierSchema.safeParse({ name: "X", countryCode: "Spain", vatNumber: "", vatRegime: "intra_ue", email: "", notes: "", active: true }).success).toBe(false);
  });

  it("refuses a document listing the same product twice", () => {
    const draft = {
      supplierId: 1, documentKind: "invoice", documentNumber: "FV-1", documentDate: "2026-09-20",
      freightCents: 0, dutiesCents: 0, notes: "",
      lines: [{ productId: 7, quantity: 1, unitCostCents: 650 }, { productId: 7, quantity: 2, unitCostCents: 650 }],
    };
    expect(receiptDraftSchema.safeParse(draft).success).toBe(false);
    expect(receiptDraftSchema.safeParse({ ...draft, lines: [draft.lines[0]] }).success).toBe(true);
  });
});

describe("stripePaymentFee", () => {
  const client = (intent: unknown) => ({ get: vi.fn(async () => intent), post: vi.fn() }) as unknown as StripeClient & { get: ReturnType<typeof vi.fn> };

  it("reads the fee from the charge's balance transaction", async () => {
    const stripe = client({ latest_charge: { balance_transaction: { fee: 87, currency: "eur" } } });
    expect(await stripePaymentFee(stripe, "pi_123")).toBe(87);
    expect(stripe.get).toHaveBeenCalledWith("/payment_intents/pi_123?expand[]=latest_charge.balance_transaction");
  });

  it.each([
    ["an unsettled charge", { latest_charge: { balance_transaction: null } }],
    ["an unexpanded charge", { latest_charge: "ch_1" }],
    ["another currency", { latest_charge: { balance_transaction: { fee: 87, currency: "usd" } } }],
    ["a missing intent", null],
  ])("leaves the fee unknown for %s", async (_label, intent) => {
    expect(await stripePaymentFee(client(intent), "pi_123")).toBeNull();
  });
});

describe("parseCostImport", () => {
  it("reads semicolon and tab separated lines, skipping a header and blank lines", () => {
    expect(parseCostImport(["SKU;costo", "COBALT-DRAKE-4-60F;6,50", "", "PORTA-DECK-GIALLO\t14", ""].join("\n"))).toEqual({
      rows: [
        { line: 2, sku: "COBALT-DRAKE-4-60F", unitCostCents: 650 },
        { line: 4, sku: "PORTA-DECK-GIALLO", unitCostCents: 1400 },
      ],
      errors: [],
    });
  });

  it("reports unreadable lines and duplicates instead of guessing", () => {
    const parsed = parseCostImport(["A-1;6,50", "a-1;7", "B 2;3", "C-3;tre", "D-4;1;2"].join("\n"));
    expect(parsed.rows).toEqual([{ line: 1, sku: "A-1", unitCostCents: 650 }]);
    expect(parsed.errors).toHaveLength(4);
    expect(parsed.errors[0]).toContain("compare due volte");
  });
});
