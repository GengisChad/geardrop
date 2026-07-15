"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useWishlist } from "@/lib/store/wishlist";
import type { Product } from "@/lib/commerce/types";

export function WishlistClient({ catalogue }: { catalogue: readonly Product[] }) {
  const hydrated = useWishlist((s) => s.hydrated);
  const slugs = useWishlist((s) => s.slugs);

  if (!hydrated) {
    return (
      <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="h-80 animate-pulse rounded-[--radius-card] bg-grey-200" />
        ))}
      </ul>
    );
  }

  // Slugs removed from the catalogue simply drop out of the list.
  const saved = slugs.flatMap((slug) => catalogue.filter((product) => product.slug === slug));

  if (saved.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        title="Nessun preferito"
        message="Tocca il cuore su un prodotto per salvarlo e ritrovarlo qui."
        href="/negozio"
      />
    );
  }

  return (
    <ul data-testid="wishlist-grid" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence initial={false}>
        {saved.map((product) => (
          <motion.li key={product.slug} layout exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
            <ProductCard product={product} showTagline className="h-full" />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
