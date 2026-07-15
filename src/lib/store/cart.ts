"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/commerce/types";

export const MAX_QUANTITY_PER_LINE = 10;

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
