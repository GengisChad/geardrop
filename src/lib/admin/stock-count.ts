/**
 * "Conteggio inventario" (owner, 2026-11-18): the pieces counted on the shelf become the shop's
 * stock. A count includes the pieces of paid orders not shipped yet, which the shop has already
 * taken off its stock, so those are subtracted first (same rule as the count of 17/11).
 */

export type StockCountRow = {
  readonly productId: number;
  readonly name: string;
  readonly sku: string;
  /** What the shop sells from now (paid, unshipped orders already taken off). */
  readonly stock: number;
  /** Pieces still on the shelf for paid orders not shipped yet. */
  readonly onOrders: number;
  readonly lowStockThreshold: number;
  readonly manageStock: boolean;
  readonly active: boolean;
};

export type StockCountChange = {
  readonly productId: number;
  readonly sku: string;
  readonly name: string;
  readonly counted: number;
  readonly newStock: number;
  readonly delta: number;
};

export type StockCountProblem = { readonly productId: number; readonly name: string; readonly message: string };

/** A counted figure as typed: blank means "not counted", anything else must be a whole number 0-100000. */
export function parseCounted(value: string | null | undefined): number | null | "invalid" {
  const text = (value ?? "").trim();
  if (text === "") return null;
  if (!/^\d{1,6}$/.test(text)) return "invalid";
  const number = Number(text);
  return number <= 100_000 ? number : "invalid";
}

/** What applying the count would change: one movement per product whose stock differs. */
export function stockCountPlan(
  rows: readonly StockCountRow[],
  counted: ReadonlyMap<number, string>,
): { readonly changes: readonly StockCountChange[]; readonly problems: readonly StockCountProblem[]; readonly matching: number } {
  const changes: StockCountChange[] = [];
  const problems: StockCountProblem[] = [];
  let matching = 0;
  for (const row of rows) {
    const value = parseCounted(counted.get(row.productId));
    if (value === null) continue;
    if (value === "invalid") {
      problems.push({ productId: row.productId, name: row.name, message: "Scrivi un numero intero di pezzi." });
      continue;
    }
    if (!row.manageStock) {
      problems.push({ productId: row.productId, name: row.name, message: "Prodotto senza gestione stock: il conteggio non si applica." });
      continue;
    }
    const newStock = value - row.onOrders;
    if (newStock < 0) {
      problems.push({
        productId: row.productId,
        name: row.name,
        message: `Contati ${value}, ma ${row.onOrders} sono già di ordini da spedire: ricontrolla.`,
      });
      continue;
    }
    const delta = newStock - row.stock;
    if (delta === 0) {
      matching += 1;
      continue;
    }
    changes.push({ productId: row.productId, sku: row.sku, name: row.name, counted: value, newStock, delta });
  }
  return { changes, problems, matching };
}

/** The note every movement of one count carries, with the day it was applied (Rome time). */
export function stockCountNote(at: Date): string {
  const day = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(at);
  return `Conteggio fisico del ${day}`;
}

/** Thresholds typed in the count sheet: whole numbers 0-10000, blank keeps the current one. */
export function parseThreshold(value: string | null | undefined): number | null {
  const text = (value ?? "").trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const number = Number(text);
  return number <= 10_000 ? number : null;
}
