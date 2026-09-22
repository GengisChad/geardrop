"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Bell } from "lucide-react";
import { cutoutSrc } from "@/data/assets";
import { AnimatePresence, motion } from "framer-motion";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { StockBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { BLADE_TYPE_LABEL, stockLabel } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/**
 * Sticky buy bar from mockup-pdp-cobalt-mobile. Appears once the main CTA has scrolled up
 * out of view, so it never duplicates a visible button nor covers the price on arrival.
 */
export function StickyBuyBar({ product }: { product: Product }) {
  const [visible, setVisible] = useState(false);
  const image = product.images[0];

  const scrollToRestockForm = useCallback(() => {
    const form = document.getElementById("restock-form");
    if (!form) return;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus the email input inside the form so the keyboard opens on mobile.
    const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
    emailInput?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const anchor = document.getElementById("buy-panel");
    if (!anchor) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          exit={{ y: "110%" }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          data-testid="sticky-buy-bar"
          // Sits above the mobile tab bar, which grows by the home-indicator inset.
          className="gd-glass-compact fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-40 border-x-0 border-b-0 lg:bottom-0"
        >
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
            {image ? (
              <Image
                src={cutoutSrc(image.src) ?? image.src}
                alt=""
                aria-hidden="true"
                width={image.width}
                height={image.height}
                sizes="56px"
                className="hidden size-12 shrink-0 object-contain sm:block"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="gd-display truncate text-small font-bold text-graphite">{product.name}</p>
              <p className="flex items-center gap-2 text-[0.6875rem] text-grey-600">
                {product.bladeType ? <span>{BLADE_TYPE_LABEL[product.bladeType]}</span> : null}
                <StockBadge status={product.stock} label={stockLabel(product)} />
              </p>
            </div>

            <p className="tabular gd-display shrink-0 text-body font-extrabold text-graphite">
              {formatPrice(product.price)}
            </p>

            <div className="w-36 shrink-0 sm:w-52">
              {product.stock === "esaurito" ? (
                <button
                  type="button"
                  onClick={scrollToRestockForm}
                  className={cn(
                    "gd-chamfer inline-flex h-12 w-full items-center justify-center gap-2",
                    "gd-display text-small font-bold tracking-[0.08em]",
                    "border border-white/15 text-grey-600",
                    "transition-[background-color,color,border-color] duration-200",
                    "hover:border-violet-soft hover:text-violet-soft",
                  )}
                >
                  <Bell className="size-4" aria-hidden="true" />
                  Avvisami
                </button>
              ) : (
                <AddToCartButton
                  slug={product.slug}
                  name={product.name}
                  stock={product.stock}
                  size="md"
                  emphasis="primary"
                  label={product.stock === "pre-ordine" ? "Pre-ordina" : "Aggiungi"}
                />
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
