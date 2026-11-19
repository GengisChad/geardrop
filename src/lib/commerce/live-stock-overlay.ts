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
  /** The selling price set in the back office. Absent on rows read without it: the catalogue's stays. */
  readonly price_cents?: number;
  /** The struck-through price of an offer, or null for none. Absent on rows read without it. */
  readonly compare_at_price_cents?: number | null;
};

/**
 * The product at the price the back office holds (owner, 2026-11-19: a price typed in "Listino e
 * margini" has to reach the shop). The catalogue's own figure is only the fallback for a row read
 * without the column or holding no usable amount; a struck-through price shows only above the price.
 */
function withLivePrice(product: Product, row: LiveStockRow): Product {
  const price = row.price_cents;
  if (price === undefined || !Number.isSafeInteger(price) || price <= 0) return product;
  const copy: { -readonly [Key in keyof Product]?: Product[Key] } = { ...product, price: { amount: price, currency: product.price.currency } };
  const compareAt = row.compare_at_price_cents;
  if (compareAt === undefined) {
    if (product.compareAtPrice && product.compareAtPrice.amount <= price) delete copy.compareAtPrice;
  } else if (compareAt !== null && Number.isSafeInteger(compareAt) && compareAt > price) {
    copy.compareAtPrice = { amount: compareAt, currency: product.price.currency };
  } else {
    delete copy.compareAtPrice;
  }
  return copy as Product;
}

/**
 * Replaces each product's availability, and its price when the row carries one, with the
 * database's, matched by slug. Products the database does not know keep the catalogue's values,
 * so a new catalogue entry is never shown as sold out just because its migration has not run yet.
 */
export function applyLiveStock(products: readonly Product[], rows: readonly LiveStockRow[]): readonly Product[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return products.map((catalogued) => {
    const row = bySlug.get(catalogued.slug);
    if (!row) return catalogued;
    const product = withLivePrice(catalogued, row);
    const autoPreorder = row.availability_override === null && row.allow_backorder === true;
    // A pre-order with a fixed number of pieces sells that number and no more: at zero it is
    // sold out until the owner adds pieces (owner's rule, 2026-09-21; migration 20260921180000).
    const soldOutPreorder = row.availability_override === "preorder" && row.preorder_allocation <= 0 && row.stock_quantity <= 0;
    return {
      ...withoutCount(product),
      // The database already reads "pre-ordine" at zero; this also holds while that change is deploying.
      stock: soldOutPreorder
        ? "esaurito"
        : autoPreorder && row.stock_quantity <= 0 && row.stock_status === "esaurito"
          ? "pre-ordine"
          : row.stock_status,
      ...(isUnlimitedStock(row)
        ? {}
        : { availableQuantity: row.availability_override === "preorder" ? row.preorder_allocation : row.stock_quantity }),
      ...(autoPreorder ? { autoPreorder: true } : {}),
    };
  });
}
