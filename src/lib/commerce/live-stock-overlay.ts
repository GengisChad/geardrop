import type { Product, StockStatus } from "./types";

/**
 * Stock of a product sold without a limit (the deck cases): the database keeps a counter this
 * high so sales can still be recorded against it. From UNLIMITED_FROM up the number is not a
 * shelf, so the shop shows no count and never caps the cart; an owner who wants a limit sets
 * a real number in the admin and the count comes back.
 */
export const UNLIMITED_STOCK = 9999;
const UNLIMITED_FROM = 1000;

/** The product without its count: the key is dropped, never set to undefined (exactOptionalPropertyTypes). */
function withoutCount(product: Product): Product {
  if (product.availableQuantity === undefined) return product;
  const copy: { -readonly [Key in keyof Product]?: Product[Key] } = { ...product };
  delete copy.availableQuantity;
  return copy as Product;
}

export function isUnlimitedStock(row: { readonly stock_quantity: number; readonly availability_override: string | null }): boolean {
  return row.availability_override !== "preorder" && row.stock_quantity >= UNLIMITED_FROM;
}

export type LiveStockRow = {
  readonly slug: string;
  readonly stock_status: StockStatus;
  readonly stock_quantity: number;
  readonly preorder_allocation: number;
  readonly availability_override: string | null;
  /** Sell as a pre-order once the stock runs out. Absent on rows read before the column was selected. */
  readonly allow_backorder?: boolean;
};

/**
 * Replaces each product's availability with the database's, matched by slug. Products the
 * database does not know keep the catalogue's values, so a new catalogue entry is never shown
 * as sold out just because its migration has not run yet.
 */
export function applyLiveStock(products: readonly Product[], rows: readonly LiveStockRow[]): readonly Product[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return products.map((product) => {
    const row = bySlug.get(product.slug);
    if (!row) return product;
    const autoPreorder = row.availability_override === null && row.allow_backorder === true;
    return {
      ...withoutCount(product),
      // The database already reads "pre-ordine" at zero; this also holds while that change is deploying.
      stock: autoPreorder && row.stock_quantity <= 0 && row.stock_status === "esaurito" ? "pre-ordine" : row.stock_status,
      ...(isUnlimitedStock(row)
        ? {}
        : { availableQuantity: row.availability_override === "preorder" ? row.preorder_allocation : row.stock_quantity }),
      ...(autoPreorder ? { autoPreorder: true } : {}),
    };
  });
}
