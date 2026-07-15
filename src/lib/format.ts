import type { Money } from "@/lib/commerce/types";

/**
 * `useGrouping: "always"` is deliberate. CLDR gives it-IT the "min2" strategy, so by
 * default four-digit numbers are left ungrouped ("1230"), and only five digits and up
 * get a separator. The mockups group from four digits — "(1.230)" recensioni — so the
 * default would silently contradict the design.
 */
const eurFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  useGrouping: "always",
});

/**
 * Italian currency: comma decimal, symbol first — "€24,99". (audit §7.7)
 *
 * Intl in it-IT renders "24,99 €"; the mockups always put the symbol first, so the
 * parts are reassembled rather than string-replaced.
 */
export function formatPrice(money: Money): string {
  const parts = eurFormatter.formatToParts(money.amount / 100);
  const number = parts
    .filter((part) => part.type !== "currency" && part.type !== "literal")
    .map((part) => part.value)
    .join("");
  return `€${number}`;
}

/** "€4,99" or "Gratis" — used wherever a zero charge should read as a benefit. */
export function formatShipping(money: Money): string {
  return money.amount === 0 ? "Gratis" : formatPrice(money);
}

export function formatRating(rating: number): string {
  return rating.toFixed(1).replace(".", ",");
}

const countFormatter = new Intl.NumberFormat("it-IT", { useGrouping: "always" });

/** "1.230" — Italian thousands separator. See the note on eurFormatter. */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function discountPercent(price: Money, compareAt: Money): number {
  if (compareAt.amount <= 0) return 0;
  return Math.round(((compareAt.amount - price.amount) / compareAt.amount) * 100);
}
