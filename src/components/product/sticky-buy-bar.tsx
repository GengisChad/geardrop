"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { StockBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { BLADE_TYPE_LABEL } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";

/**
 * Sticky buy bar from mockup-pdp-cobalt-mobile. Appears once the main CTA scrolls out,
 * so it never duplicates a visible button.
 */
export function StickyBuyBar({ product }: { product: Product }) {
  const [visible, setVisible] = useState(false);
  const image = product.images[0];

  useEffect(() => {
    const anchor = document.getElementById("buy-panel");
    if (!anchor) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry?.isIntersecting), { threshold: 0 });
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
          // Sits above the mobile tab bar.
          className="fixed inset-x-0 bottom-[4.25rem] z-40 border-t border-grey-200 bg-white/95 backdrop-blur lg:bottom-0"
        >
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
            {image ? (
              <Image
                src={image.src}
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
                <StockBadge status={product.stock} />
              </p>
            </div>

            <p className="tabular gd-display shrink-0 text-body font-extrabold text-graphite">
              {formatPrice(product.price)}
            </p>

            <div className="w-36 shrink-0 sm:w-52">
              <AddToCartButton
                slug={product.slug}
                name={product.name}
                stock={product.stock}
                size="md"
                emphasis="primary"
                label={product.stock === "esaurito" ? "Avvisami" : "Aggiungi"}
              />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
