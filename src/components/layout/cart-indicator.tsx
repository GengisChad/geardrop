"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { RollingNumber } from "@/components/ui/rolling-number";
import { selectCartCount, useCart } from "@/lib/store/cart";
import { cn } from "@/lib/cn";

export function CartIndicator({ className }: { className?: string }) {
  const hydrated = useCart((s) => s.hydrated);
  const count = useCart(selectCartCount);
  // The server always renders 0; showing a persisted count before rehydration finishes
  // would be a mismatch.
  const visible = hydrated && count > 0;

  // Empty, it is a quiet outline; with something inside it turns into the lime slash with the count.
  return (
    <Link
      href="/carrello"
      data-testid="cart-link"
      className={cn("group relative inline-flex", className)}
      aria-label={visible ? `Carrello, ${count} ${count === 1 ? "articolo" : "articoli"}` : "Carrello, vuoto"}
    >
      <span
        className={cn(
          "gd-chamfer inline-flex h-11 min-w-12 items-center justify-center gap-1.5 px-3.5 transition-colors duration-200",
          visible ? "bg-lime text-void group-hover:bg-[#e2ff7a]" : "bg-surface-2 text-graphite group-hover:bg-lime group-hover:text-void",
        )}
      >
        <ShoppingBag className="size-5" strokeWidth={2} aria-hidden="true" />
        {visible ? (
          // The count rolls like a counter when a piece goes in; a stored cart opens at rest.
          <RollingNumber value={String(count)} data-testid="cart-count" className="tabular gd-display-wide text-[0.9375rem] font-extrabold leading-none" />
        ) : null}
      </span>
    </Link>
  );
}
