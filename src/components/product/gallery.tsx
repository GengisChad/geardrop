"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PromoBadge } from "@/components/ui/badge";
import { WishlistButton } from "@/components/product/wishlist-button";
import type { ProductImage } from "@/data/assets";
import type { PromoTag } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type GalleryProps = {
  images: readonly ProductImage[];
  slug: string;
  name: string;
  promo?: PromoTag;
};

export function Gallery({ images, slug, name, promo }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const active = images[index];
  const many = images.length > 1;

  const step = (delta: number) => setIndex((current) => (current + delta + images.length) % images.length);

  if (!active) return null;

  return (
    <div className="flex flex-col gap-3">
      <div data-testid="product-gallery" className="gd-glass-panel relative overflow-hidden rounded-[--radius-glass]">
        {/* Product art on a light plate, as in every mockup. (audit §7.6) */}
        <div className="gd-product-plate relative m-2 aspect-square overflow-hidden rounded-[calc(var(--radius-glass)-0.45rem)] sm:m-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.src}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <Image
                src={active.src}
                alt={active.alt}
                fill
                priority
                sizes="(min-width: 1024px) 620px, 92vw"
                className="object-contain p-8"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {promo ? (
          <span className="absolute left-4 top-4">
            <PromoBadge tag={promo} />
          </span>
        ) : null}

        <span className="absolute right-4 top-4">
          <WishlistButton slug={slug} name={name} size="md" />
        </span>

        {many ? (
          <>
            <GalleryArrow direction="prev" onClick={() => step(-1)} />
            <GalleryArrow direction="next" onClick={() => step(1)} />
          </>
        ) : null}
      </div>

      {many ? (
        <ul className="flex gap-2.5">
          {images.map((image, i) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Immagine ${i + 1} di ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "gd-glass-compact relative size-16 overflow-hidden rounded-lg border-2 transition-colors sm:size-20",
                  i === index ? "border-violet" : "border-grey-200 hover:border-grey-400",
                )}
              >
                <Image src={image.src} alt="" aria-hidden="true" fill sizes="80px" className="object-contain p-1.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function GalleryArrow({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Immagine precedente" : "Immagine successiva"}
      className={cn(
        "absolute top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full",
        "gd-glass-compact text-graphite transition-colors hover:border-violet hover:text-violet",
        direction === "prev" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
