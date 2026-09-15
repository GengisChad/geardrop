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

  return (
    <Link
      href="/carrello"
      data-testid="cart-link"
      className={cn("group relative inline-flex", className)}
      aria-label={visible ? `Carrello, ${count} ${count === 1 ? "articolo" : "articoli"}` : "Carrello, vuoto"}
    >
      <span className="gd-chamfer inline-flex size-11 items-center justify-center bg-white/[0.07] text-graphite transition-colors duration-200 group-hover:bg-lime group-hover:text-void">
        <ShoppingBag className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      {visible ? (
        <motion.span
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          data-testid="cart-count"
          className="tabular gd-mono absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[0.6875rem] font-bold leading-none text-void shadow-[0_0_14px_rgba(198,255,0,0.6)]"
        >
          {count}
        </motion.span>
      ) : null}
    </Link>
  );
}
