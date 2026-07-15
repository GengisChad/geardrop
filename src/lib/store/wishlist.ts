"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type WishlistState = {
  slugs: string[];
  /** See the note on the cart store: guards against a hydration mismatch. */
  hydrated: boolean;
  setHydrated: () => void;
  toggle: (slug: string) => void;
  add: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

export const useWishlist = create<WishlistState>()(
  persist(
    (set) => ({
      slugs: [],
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      toggle: (slug) =>
        set((state) => ({
          slugs: state.slugs.includes(slug) ? state.slugs.filter((s) => s !== slug) : [...state.slugs, slug],
        })),

      add: (slug) => set((state) => (state.slugs.includes(slug) ? state : { slugs: [...state.slugs, slug] })),

      remove: (slug) => set((state) => ({ slugs: state.slugs.filter((s) => s !== slug) })),

      clear: () => set({ slugs: [] }),
    }),
    {
      name: "geardrop.wishlist",
      version: 1,
      partialize: (state) => ({ slugs: state.slugs }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

export const selectIsSaved =
  (slug: string) =>
  (state: WishlistState): boolean =>
    state.slugs.includes(slug);
