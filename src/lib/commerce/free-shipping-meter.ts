import type { CartQuote } from "@/lib/commerce/types";

/**
 * The free-shipping meter is the stadium's toothed rail cut into twenty teeth. A tooth lights for
 * every twentieth of the threshold the buyer pays, so at a €100 threshold each tooth is €5.
 */
export const METER_TEETH = 20;

/** Gap between two teeth lighting one after the other, in milliseconds. */
export const TOOTH_STAGGER_MS = 45;

/** Teeth lit for `paid` cents (subtotal minus discount, as `freeShippingRemaining` measures it). */
export function meterTeeth(paid: number, threshold: number | null): number {
  if (!threshold || threshold <= 0 || paid <= 0) return 0;
  return Math.min(METER_TEETH, Math.floor((paid / threshold) * METER_TEETH));
}

/**
 * When a tooth starts lighting after the meter moved from `from` lit teeth to `lit`: only the
 * teeth that the new quote adds animate, one after the other. Null means the tooth stays still.
 */
export function toothDelay(index: number, from: number, lit: number): number | null {
  if (lit <= from || index < from || index >= lit) return null;
  return (index - from) * TOOTH_STAGGER_MS;
}

/** What the add toast can truthfully say about free shipping, from the server's quote. */
export type ShippingLine =
  | { readonly kind: "pending" }
  | { readonly kind: "none" }
  | { readonly kind: "remaining"; readonly remaining: number; readonly teeth: number }
  | { readonly kind: "unlocked"; readonly teeth: number };

export function shippingLine(quote: CartQuote | null, loading: boolean): ShippingLine {
  if (!quote || loading) return { kind: "pending" };
  const threshold = quote.freeShippingThreshold;
  const { subtotal, discount, freeShippingRemaining } = quote.totals;
  if (!threshold || subtotal.amount <= 0) return { kind: "none" };
  if (freeShippingRemaining === 0) return { kind: "unlocked", teeth: METER_TEETH };
  return { kind: "remaining", remaining: freeShippingRemaining, teeth: meterTeeth(subtotal.amount - discount.amount, threshold) };
}
