"use client";

import { useMemo } from "react";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";
import { useCart } from "@/lib/store/cart";
import type { CartTotals, Product } from "@/lib/commerce/types";

export type DetailedLine = { product: Product; quantity: number; lineTotal: number };

/**
 * Joins persisted cart lines (slug + qty) to catalogue products, and totals them.
 *
 * Totals are recomputed here rather than read from the provider because the cart lives
 * in the browser. `computeTotals` on the provider is the authority at checkout time —
 * this mirrors its rules for display. Lines whose slug is no longer in the catalogue
 * are dropped, so a stale localStorage cart cannot crash the page.
 */
export function useCartDetails(): {
  lines: DetailedLine[];
  totals: CartTotals;
  count: number;
  hydrated: boolean;
} {
  const rawLines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);

  return useMemo(() => {
    const lines = rawLines.flatMap<DetailedLine>((line) => {
      const product = PRODUCTS.find((p) => p.slug === line.slug);
      if (!product) return [];
      return [{ product, quantity: line.quantity, lineTotal: product.price.amount * line.quantity }];
    });

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const isEmpty = subtotal === 0;
    const qualifies = subtotal >= FREE_SHIPPING_THRESHOLD;
    const shipping = isEmpty || qualifies ? 0 : SHIPPING_FLAT_RATE;

    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      hydrated,
      totals: {
        subtotal: { amount: subtotal, currency: "EUR" },
        shipping: { amount: shipping, currency: "EUR" },
        total: { amount: subtotal + shipping, currency: "EUR" },
        freeShippingRemaining: isEmpty || qualifies ? 0 : FREE_SHIPPING_THRESHOLD - subtotal,
      },
    };
  }, [rawLines, hydrated]);
}
