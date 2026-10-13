import type { Product } from "@/lib/commerce/types";

/**
 * Working days the shop promises before a waiting item ships (src/lib/labels.ts): up to 15 for a
 * pre-order beyond stock, about 20 for one that waits for the Hasbro release.
 */
const PREORDER_WORKING_DAYS = 15;
const RELEASE_WORKING_DAYS = 20;

/**
 * When a backorder item is expected, as Google requires for every backorder offer: the far end of
 * the delay the product page states, counted in working days from today.
 */
export function availabilityDate(product: Pick<Product, "releasePreorder">, now: Date = new Date()): string {
  const date = addWorkingDays(now, product.releasePreorder ? RELEASE_WORKING_DAYS : PREORDER_WORKING_DAYS);
  return `${date.toISOString().slice(0, 10)}T00:00:00Z`;
}

/** Midnight UTC of the day `days` working days (Monday to Friday) after `from`. */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}
