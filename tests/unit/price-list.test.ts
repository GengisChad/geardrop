import { describe, expect, it } from "vitest";
import { priceListRow, priceListRows, priceListTotals, type PriceListSource } from "@/lib/admin/price-list";

/** The price list page (owner, 2026-11-17): cost, list price and what the shelf can earn. */

const VAT = 2200;

const source = (overrides: Partial<PriceListSource> = {}): PriceListSource => ({
  productId: 1,
  name: "Blast Pegasus A Tr",
  sku: "BLAST-PEGASUS-A-TR",
  priceCents: 2690,
  quantity: 45,
  unlimitedStock: false,
  averageCostCents: 1250,
  ...overrides,
});

describe("one product on the price list", () => {
  it("takes VAT out of the price before the margin", () => {
    const row = priceListRow(source(), VAT);
    // 26,90 with 22% VAT is 22,05 net; a piece that cost 12,50 leaves 9,55.
    expect(row.netPriceCents).toBe(2205);
    expect(row.unitMarginCents).toBe(955);
    expect(row.marginPercent).toBe(43.3);
  });

  it("values the shelf at cost, at list price and at margin", () => {
    const row = priceListRow(source(), VAT);
    expect(row.stockValueCents).toBe(45 * 1250);
    expect(row.potentialGrossCents).toBe(45 * 2690);
    expect(row.potentialNetCents).toBe(45 * 2205);
    expect(row.potentialMarginCents).toBe(45 * 955);
  });

  it("never guesses a missing cost", () => {
    const row = priceListRow(source({ averageCostCents: null }), VAT);
    expect(row.unitMarginCents).toBeNull();
    expect(row.marginPercent).toBeNull();
    expect(row.stockValueCents).toBeNull();
    expect(row.potentialMarginCents).toBeNull();
    // What it would bring in is still known: the price is.
    expect(row.potentialGrossCents).toBe(45 * 2690);
  });

  it("shows a loss as a negative margin", () => {
    const row = priceListRow(source({ priceCents: 1220, averageCostCents: 1250 }), VAT);
    expect(row.netPriceCents).toBe(1000);
    expect(row.unitMarginCents).toBe(-250);
    expect(row.potentialMarginCents).toBe(45 * -250);
  });
});

describe("the whole price list", () => {
  const pegasus = source();
  const phoenix = source({ productId: 2, name: "Soar Phoenix 9-60GF", sku: "SOAR-PHOENIX-9-60GF", priceCents: 2490, quantity: 186, averageCostCents: null });
  const deckCase = source({ productId: 3, name: "Porta Deck Giallo", sku: "PORTA-DECK-GIALLO", priceCents: 1800, quantity: 0, unlimitedStock: true, averageCostCents: null });
  const soldOut = source({ productId: 4, name: "Impact Drake 9-60LR", sku: "IMPACT-DRAKE-9-60LR", priceCents: 1399, quantity: 0, averageCostCents: 700 });

  it("leads with the shelf worth the most at list price, then by name", () => {
    expect(priceListRows([deckCase, pegasus, soldOut, phoenix], VAT).map((row) => row.sku)).toEqual([
      "SOAR-PHOENIX-9-60GF",
      "BLAST-PEGASUS-A-TR",
      "IMPACT-DRAKE-9-60LR",
      "PORTA-DECK-GIALLO",
    ]);
  });

  it("keeps products without a cost out of the margin, and says what that leaves uncovered", () => {
    const totals = priceListTotals(priceListRows([pegasus, phoenix, deckCase, soldOut], VAT));
    expect(totals.pieces).toBe(45 + 186);
    expect(totals.stockValueCents).toBe(45 * 1250);
    expect(totals.potentialGrossCents).toBe(45 * 2690 + 186 * 2490);
    expect(totals.potentialMarginCents).toBe(45 * 955);
    expect(totals.marginPercent).toBe(43.3);
    // The Phoenix shelf has no cost; the deck case is sold to order and hides nothing.
    expect(totals.productsWithoutCost).toBe(1);
    expect(totals.piecesWithoutCost).toBe(186);
    expect(totals.uncoveredNetCents).toBe(186 * 2041);
  });

  it("has no margin percentage while no product has a cost", () => {
    const totals = priceListTotals(priceListRows([phoenix], VAT));
    expect(totals.marginPercent).toBeNull();
    expect(totals.potentialMarginCents).toBe(0);
  });
});
