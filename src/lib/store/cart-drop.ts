import { create } from "zustand";

/** The piece the drop sheet is confirming. */
export type CartDropItem = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly preorder: boolean;
  /** The photo the shopper tapped beside, as the browser already loaded it. */
  readonly image: { readonly src: string; readonly alt: string } | null;
};

type CartDropState = {
  readonly item: CartDropItem | null;
  /**
   * Teeth of the free-shipping rail the sheet last showed lit, so the next add lights only the
   * new ones. It is what the server last answered, kept for the animation: never a total.
   */
  readonly litTeeth: number;
  show: (item: Omit<CartDropItem, "id">) => void;
  close: () => void;
  setLitTeeth: (teeth: number) => void;
};

let nextId = 0;

/**
 * The sheet that answers an add to cart (components/cart/cart-drop.tsx). Not persisted: it is
 * feedback for a tap, and a reload must never bring it back.
 */
export const useCartDrop = create<CartDropState>((set) => ({
  item: null,
  litTeeth: 0,
  show: (item) => set({ item: { ...item, id: ++nextId } }),
  close: () => set({ item: null }),
  setLitTeeth: (litTeeth) => set({ litTeeth }),
}));
