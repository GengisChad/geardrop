"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/store/cart";

/** Empties the cart once Stripe has confirmed the checkout, never earlier. */
export function ClearCart() {
  const clear = useCart((s) => s.clear);

  useEffect(() => {
    clear();
  }, [clear]);

  return null;
}
