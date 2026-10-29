"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PromoBadge } from "@/components/ui/badge";
import { SharedPackshot } from "@/components/product/shared-packshot";
import { ProductZoom } from "@/components/product/product-zoom";
import { WishlistButton } from "@/components/product/wishlist-button";
import { cutoutSrc, type ProductImage } from "@/data/assets";
import type { PromoTag } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type GalleryProps = {
  images: readonly ProductImage[];
  slug: string;
  name: string;
  promo?: PromoTag;
  /** The part number printed large behind the packshot ("9-60"). */
  mark?: string;
  /** The pack's colours (lib/holo.ts), which tint the plate. */
  style?: CSSProperties;
  /** The name the first photo shares with its catalogue card (lib/view-transitions.ts). */
  transitionName?: string | undefined;
};

export function Gallery({ images, slug, name, promo, mark, style, transitionName }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const active = images[index];
  const many = images.length > 1;

  const step = (delta: number) => setIndex((current) => (current + delta + images.length) % images.length);

  if (!active) return null;

  return (
    /*
     * Sticky on lg so the packshot stays in view while the (longer) buy column scrolls.
     * top clears the sticky site header (h-[4.5rem] on sm+) plus a comfortable gap.
     * On lg with 2+ images the thumbnails switch to a vertical strip on the left of the
     * main image; on mobile they keep the horizontal row below it.
     */
    <div style={style} className="flex flex-col gap-3 lg:sticky lg:top-[calc(4.5rem+1.5rem)] lg:self-start">
      <div className={cn("flex flex-col gap-3", many && "lg:flex-row lg:items-start")}>
        {/* Vertical thumbnail strip — hidden on mobile, shown on lg when there are 2+ images */}
        {many ? (
          <ul className="hidden lg:flex lg:flex-col lg:gap-2">
            {images.map((image, i) => (
              <li key={image.src}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Immagine ${i + 1} di ${images.length}`}
                  aria-current={i === index}
                  className={cn(
                    "relative size-16 overflow-hidden border-2 bg-surface transition-colors",
                    i === index ? "border-lime" : "border-white/10 hover:border-white/30",
                  )}
                >
                  <Image src={cutoutSrc(image.src) ?? image.src} alt="" aria-hidden="true" fill sizes="64px" className="object-contain p-1.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div data-testid="product-gallery" className="gd-glass-panel relative overflow-hidden rounded-[--radius-glass] lg:flex-1">
        {/* The cut-out floats in a dark art window tinted like the holographic cards. */}
        <div className="gd-product-plate aspect-square overflow-hidden">
          {mark ? (
            <span
              aria-hidden="true"
              className="gd-watermark left-4 top-2 animate-[gd-mark-in_0.9s_var(--ease-out-gear)_0.15s_both] text-[5.5rem] [-webkit-text-stroke-width:1.6px] motion-reduce:animate-none sm:left-6 sm:text-[9rem] sm:[-webkit-text-stroke-width:2px] xl:text-[10.5rem]"
            >
              {mark}
            </span>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.src}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <SharedPackshot name={index === 0 ? transitionName : undefined}>
                <Image
                  src={cutoutSrc(active.src) ?? active.src}
                  alt={active.alt}
                  fill
                  priority
                  quality={90}
                  sizes="(min-width: 1400px) 720px, (min-width: 1024px) calc(100vw - 660px), 92vw"
                  className="object-contain p-6 drop-shadow-[0_24px_28px_rgba(0,0,0,0.55)] sm:p-10"
                />
              </SharedPackshot>
            </motion.div>
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label={`Ingrandisci la foto di ${name}`}
            aria-haspopup="dialog"
            data-testid="product-zoom-open"
            className="group absolute inset-0 cursor-zoom-in"
          >
            <span className="absolute bottom-3 right-3 inline-flex size-11 items-center justify-center border border-white/15 bg-void/65 text-graphite transition-colors group-hover:border-lime group-hover:text-lime">
              <ZoomIn className="size-4" aria-hidden="true" />
            </span>
          </button>
        </div>

        {promo ? (
          <span className="pointer-events-none absolute bottom-5 left-5">
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
        </div>{/* closes product-gallery */}
      </div>{/* closes inner flex row */}

      <ProductZoom
        images={images}
        index={index}
        name={name}
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        onIndexChange={setIndex}
      />

      {/* Horizontal thumbnails: only on mobile; lg uses the vertical strip above */}
      {many ? (
        <ul className="flex gap-2.5 lg:hidden">
          {images.map((image, i) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Immagine ${i + 1} di ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative size-16 overflow-hidden border-2 bg-surface transition-colors sm:size-20",
                  i === index ? "border-lime" : "border-white/10 hover:border-white/30",
                )}
              >
                <Image src={cutoutSrc(image.src) ?? image.src} alt="" aria-hidden="true" fill sizes="80px" className="object-contain p-1.5" />
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
        "absolute top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center",
        "border border-white/15 bg-void/65 text-graphite transition-colors hover:border-lime hover:text-lime",
        direction === "prev" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
