import type { Product, StockStatus } from "./types";

export type LiveStockRow = {
  readonly slug: string;
  readonly stock_status: StockStatus;
  readonly stock_quantity: number;
  readonly preorder_allocation: number;
  readonly availability_override: string | null;
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
    return {
      ...product,
      stock: row.stock_status,
      availableQuantity: row.availability_override === "preorder" ? row.preorder_allocation : row.stock_quantity,
    };
  });
}
