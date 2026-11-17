import { marginPercent, netOfVat } from "./warehouse";

/**
 * The price list read against the shelf (owner, 2026-11-17: "carichiamo prezzo prodotti del
 * magazzino così facciamo la stima che c'è e quanto margine possiamo farci"). For every product:
 * what a piece costs, what it sells for, what is left on the price once VAT is taken out, and what
 * the pieces on the shelf are worth if they all sell at list price.
 *
 * It is an estimate before courier, payment fees and packaging: those belong to an order, and the
 * order's own profit (order_profit) counts them. A product without a cost is never guessed: it
 * stays out of the margin, and the totals say how many pieces that leaves uncovered.
 */

export type PriceListSource = {
  readonly productId: number;
  readonly name: string;
  readonly sku: string;
  /** List price, VAT included. */
  readonly priceCents: number;
  /** Pieces counted for value: zero for a product sold to order (no real shelf). */
  readonly quantity: number;
  readonly unlimitedStock: boolean;
  readonly averageCostCents: number | null;
};

export type PriceListRow = PriceListSource & {
  readonly netPriceCents: number;
  /** Net price minus cost, for one piece; null without a cost. */
  readonly unitMarginCents: number | null;
  readonly marginPercent: number | null;
  /** Shelf at cost; null without a cost. */
  readonly stockValueCents: number | null;
  /** Shelf at list price, VAT included. */
  readonly potentialGrossCents: number;
  readonly potentialNetCents: number;
  /** Shelf margin if every piece sells at list price; null without a cost. */
  readonly potentialMarginCents: number | null;
};

export type PriceListTotals = {
  readonly pieces: number;
  readonly stockValueCents: number;
  readonly potentialGrossCents: number;
  readonly potentialNetCents: number;
  /** Over the products with a cost only. */
  readonly potentialMarginCents: number;
  /** Margin over the net revenue of the products with a cost, in percent with one decimal. */
  readonly marginPercent: number | null;
  readonly productsWithoutCost: number;
  readonly piecesWithoutCost: number;
  /** Net revenue of the pieces whose cost is missing: what the margin above does not cover. */
  readonly uncoveredNetCents: number;
};

export function priceListRow(source: PriceListSource, vatRateBp: number): PriceListRow {
  const netPriceCents = netOfVat(source.priceCents, vatRateBp);
  const cost = source.averageCostCents;
  return {
    ...source,
    netPriceCents,
    unitMarginCents: cost === null ? null : netPriceCents - cost,
    marginPercent: marginPercent(netPriceCents, cost),
    stockValueCents: cost === null ? null : source.quantity * cost,
    potentialGrossCents: source.quantity * source.priceCents,
    potentialNetCents: source.quantity * netPriceCents,
    potentialMarginCents: cost === null ? null : source.quantity * (netPriceCents - cost),
  };
}

/** The shelf worth the most at list price first; products with nothing to sell last, by name. */
export function priceListRows(sources: readonly PriceListSource[], vatRateBp: number): readonly PriceListRow[] {
  return sources
    .map((source) => priceListRow(source, vatRateBp))
    .sort((a, b) => b.potentialGrossCents - a.potentialGrossCents || a.name.localeCompare(b.name, "it"));
}

export function priceListTotals(rows: readonly PriceListRow[]): PriceListTotals {
  let pieces = 0;
  let stockValueCents = 0;
  let potentialGrossCents = 0;
  let potentialNetCents = 0;
  let potentialMarginCents = 0;
  let coveredNetCents = 0;
  let productsWithoutCost = 0;
  let piecesWithoutCost = 0;
  let uncoveredNetCents = 0;

  for (const row of rows) {
    pieces += row.quantity;
    potentialGrossCents += row.potentialGrossCents;
    potentialNetCents += row.potentialNetCents;
    if (row.potentialMarginCents === null || row.stockValueCents === null) {
      // A product sold to order has no shelf to value: its missing cost hides nothing here.
      if (row.quantity > 0) {
        productsWithoutCost += 1;
        piecesWithoutCost += row.quantity;
        uncoveredNetCents += row.potentialNetCents;
      }
      continue;
    }
    stockValueCents += row.stockValueCents;
    potentialMarginCents += row.potentialMarginCents;
    coveredNetCents += row.potentialNetCents;
  }

  return {
    pieces,
    stockValueCents,
    potentialGrossCents,
    potentialNetCents,
    potentialMarginCents,
    marginPercent: coveredNetCents > 0 ? Math.round((potentialMarginCents / coveredNetCents) * 1000) / 10 : null,
    productsWithoutCost,
    piecesWithoutCost,
    uncoveredNetCents,
  };
}
