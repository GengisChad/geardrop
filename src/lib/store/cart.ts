"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/commerce/types";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/limits";

export { MAX_QUANTITY_PER_LINE };

type CartState = {
  lines: CartLine[];
  /**
   * False until the persisted cart has been read. Components must not render a count
   * before this flips, or the server HTML (always empty) and the first client paint
   * disagree and React reports a hydration mismatch.
   */
  hydrated: boolean;
  setHydrated: () => void;
  add: (slug: string, quantity?: number) => void;
  remove: (slug: string) => void;
  setQuantity: (slug: string, quantity: number) => void;
  /**
   * Turns one set of a bundle's components already in the cart into the bundle itself: each
   * component present loses its bundle quantity (dropping out at zero), then the bundle is added.
   */
  swapIntoBundle: (bundleSlug: string, components: readonly { readonly slug: string; readonly quantity: number }[]) => void;
  clear: () => void;
};

const clamp = (value: number) => Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.trunc(value)));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      add: (slug, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((line) => line.slug === slug);
          if (!existing) {
            return { lines: [...state.lines, { slug: slug as CartLine["slug"], quantity: clamp(quantity) }] };
          }
          return {
            lines: state.lines.map((line) =>
              line.slug === slug ? { ...line, quantity: clamp(line.quantity + quantity) } : line,
            ),
          };
        }),

      remove: (slug) => set((state) => ({ lines: state.lines.filter((line) => line.slug !== slug) })),

      setQuantity: (slug, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.slug !== slug)
              : state.lines.map((line) => (line.slug === slug ? { ...line, quantity: clamp(quantity) } : line)),
        })),

      swapIntoBundle: (bundleSlug, components) =>
        set((state) => {
          const reduced = state.lines.flatMap((line) => {
            const part = components.find((component) => component.slug === line.slug);
            if (!part) return [line];
            const left = line.quantity - part.quantity;
            return left > 0 ? [{ ...line, quantity: left }] : [];
          });
          const existing = reduced.find((line) => line.slug === bundleSlug);
          return {
            lines: existing
              ? reduced.map((line) => (line.slug === bundleSlug ? { ...line, quantity: clamp(line.quantity + 1) } : line))
              : [...reduced, { slug: bundleSlug as CartLine["slug"], quantity: 1 }],
          };
        }),

      clear: () => set({ lines: [] }),
    }),
    {
      name: "geardrop.cart",
      version: 1,
      // `hydrated` is runtime-only: persisting it would defeat its purpose.
      partialize: (state) => ({ lines: state.lines }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

export const selectCartCount = (state: CartState): number =>
  state.lines.reduce((sum, line) => sum + line.quantity, 0);

export const selectQuantity =
  (slug: string) =>
  (state: CartState): number =>
    state.lines.find((line) => line.slug === slug)?.quantity ?? 0;
