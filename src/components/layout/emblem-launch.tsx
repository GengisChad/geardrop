"use client";

import type { ReactNode } from "react";
import { useCartPulse } from "@/lib/store/cart";

/**
 * The header emblem launches once on load (its own animation class) and again every time a
 * piece goes into the cart: a new key remounts it, which restarts the launch. Rehydrating a
 * stored cart does not move the pulse, so opening a page never relaunches it.
 */
export function EmblemLaunch({ children }: { children: ReactNode }) {
  const adds = useCartPulse((state) => state.adds);
  return (
    <span key={adds} data-launches={adds} className="inline-flex">
      {children}
    </span>
  );
}
