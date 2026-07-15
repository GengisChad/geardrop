"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
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
      className={cn("relative inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-grey-100", className)}
      aria-label={visible ? `Carrello, ${count} ${count === 1 ? "articolo" : "articoli"}` : "Carrello, vuoto"}
    >
      <ShoppingCart className="size-5 text-graphite" strokeWidth={2} aria-hidden="true" />
      {visible ? (
        <motion.span
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          data-testid="cart-count"
          className="tabular gd-display absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-violet px-1 text-[0.625rem] font-bold leading-5 text-white"
        >
          {count}
        </motion.span>
      ) : null}
    </Link>
  );
}
