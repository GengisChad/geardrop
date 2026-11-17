"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
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
          <motion.span
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            data-testid="cart-count"
            className="tabular gd-display-wide text-[0.9375rem] font-extrabold leading-none"
          >
            {count}
          </motion.span>
        ) : null}
      </span>
    </Link>
  );
}
