import type { StockStatus } from "./types";

/**
 * Owner, 2026-10-08: a pre-order never shares an order with pieces that ship now. Mixed, the
 * shop had to send two parcels to the same buyer, one now and one when the pre-order landed.
 * So a cart holds either pre-orders or products that ship now, never both; the buyer orders
 * the rest first and the pre-order on its own.
 */
export const PREORDER_ALONE_ISSUE =
  "I pre-ordini si ordinano a parte: rimuovilo, completa l'ordine dei prodotti disponibili e poi pre-ordinalo.";

type QuotedLine = {
  readonly stock: StockStatus;
  readonly issue: string | null;
  readonly preorderQuantity?: number;
};

const isPreorder = (line: QuotedLine) => line.stock === "pre-ordine" || (line.preorderQuantity ?? 0) > 0;

/**
 * The lines with the rule applied: when the cart also holds something that ships now, every
 * pre-order line carries PREORDER_ALONE_ISSUE, which keeps the cart from checking out until
 * it is removed. Lines that already have an issue are left as they are.
 */
export function separatePreorders<T extends QuotedLine>(lines: readonly T[]): T[] {
  const open = lines.filter((line) => line.issue === null);
  const mixed = open.some(isPreorder) && open.some((line) => !isPreorder(line));
  if (!mixed) return [...lines];
  return lines.map((line) => (line.issue === null && isPreorder(line) ? { ...line, issue: PREORDER_ALONE_ISSUE } : line));
}
