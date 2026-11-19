import { create } from "zustand";
import type { Product, StockStatus } from "@/lib/commerce/types";

/** What the quick view shows: the card's own facts, as the server rendered them. */
export type QuickViewProduct = {
  readonly slug: Product["slug"];
  /** The full product name, for labels and the cart. */
  readonly name: string;
  /** The name as the card prints it, apart from its part code. */
  readonly title: string;
  readonly code: string | null;
  readonly mark: string | null;
  readonly tagline: string;
  readonly image: { readonly src: string; readonly alt: string } | null;
  readonly price: string;
  readonly priceCents: number;
  readonly compareAt: string | null;
  readonly availability: string;
  /** The status colour class the card uses for the same line. */
  readonly availabilityTone: string;
  readonly stock: StockStatus;
  /** Sold in several colours: the choice happens on the product page. */
  readonly colours: number;
};

/** Where the card's photo was drawn when it was tapped (lib/motion/drawn-box.ts), so it can travel into the sheet. */
export type QuickViewOrigin = { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly src: string };

type QuickViewState = {
  readonly product: QuickViewProduct | null;
  readonly origin: QuickViewOrigin | null;
  open: (product: QuickViewProduct, origin: QuickViewOrigin | null) => void;
  close: () => void;
};

/** The quick view sheet (components/product/quick-view.tsx). Never persisted. */
export const useQuickView = create<QuickViewState>((set) => ({
  product: null,
  origin: null,
  open: (product, origin) => set({ product, origin }),
  close: () => set({ product: null, origin: null }),
}));
