import Image from "next/image";
import Link from "next/link";
import { Palette } from "lucide-react";
import { HoloSurface } from "@/components/holo/holo-surface";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { WishlistButton } from "@/components/product/wishlist-button";
import { PromoBadge, RankBadge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { cutoutSrc } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, displayName, holoStyle } from "@/lib/holo";
import type { Product } from "@/lib/commerce/types";
import { familyColours } from "@/lib/commerce/variants";
import { cn } from "@/lib/cn";

type ProductCardProps = {
  product: Product;
  /** Numbers the cards of a ranked shelf. */
  rank?: number;
  showRating?: boolean;
  showTagline?: boolean;
  priority?: boolean;
  className?: string;
};

/**
 * Holographic catalogue card. The cut-out packshot floats in an art window tinted with the
 * pack's own colours; hovering tilts the card and runs foil, glitter and glare over it. The
 * whole card links to the product, while the cart and wishlist buttons stay on top.
 */
export function ProductCard({
  product,
  rank,
  showRating = false,
  showTagline = false,
  priority = false,
  className,
}: ProductCardProps) {
  const image = product.images[0];
  const cutout = image ? cutoutSrc(image.src) : null;
  const promo = product.tags[0];
  const isNew = product.tags.includes("novita");
  // An item sold in several colours has one card for all of them: it names the item, shows
  // the colours, and sends the shopper to pick one instead of adding the card's own colour.
  const colours = familyColours(product);
  const family = colours.length > 1 ? product.variant : undefined;

  return (
    <HoloSurface className={cn("h-full", className)} style={holoStyle(product)}>
      <article data-testid="product-card" data-slug={product.slug} className="gd-holo-rot h-full">
        <div className="gd-holo-face flex h-full flex-col">
          <div aria-hidden="true" className={cn("gd-holo-ring", !isNew && "opacity-30")} />

          <div className="gd-holo-art relative mx-2 mt-2 aspect-[25/23] shrink-0">
            {image ? (
              <Image
                src={cutout ?? image.src}
                alt={image.alt}
                fill
                priority={priority}
                sizes="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 46vw"
                className={cn("gd-holo-img object-contain", cutout ? "p-1.5" : "p-6")}
              />
            ) : null}
            {rank !== undefined || promo ? (
              <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-1.5">
                <span>{rank !== undefined ? <RankBadge rank={rank} /> : null}</span>
                {promo ? (
                  <PromoBadge tag={promo} className="max-sm:h-[1.375rem] max-sm:px-1.5 max-sm:text-[0.5625rem]" />
                ) : null}
              </div>
            ) : null}
            <span className="absolute bottom-1.5 right-1.5 z-20">
              <WishlistButton slug={product.slug} name={product.name} />
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
            <h3 className="gd-display-wide text-[0.95rem] font-bold leading-[1.05] sm:text-[1.15rem]">
              {/* Stretched link: the whole card is the hit target, but the buttons stay on top. */}
              <Link href={`/prodotto/${product.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
                {displayName(family?.familyName ?? product.name)}
              </Link>
            </h3>
            {family ? (
              <p className="flex items-center gap-1" data-testid="card-colours">
                {colours.map((colour) => (
                  <span
                    key={colour.slug}
                    aria-hidden="true"
                    className="size-2.5 rounded-full ring-1 ring-inset ring-black/25"
                    style={{ backgroundColor: colour.swatch }}
                  />
                ))}
                <span className="ml-1 text-[0.6875rem] text-grey-600">{colours.length} colori</span>
              </p>
            ) : null}

            {showTagline ? <p className="hidden text-small text-grey-600 sm:line-clamp-2">{product.tagline}</p> : null}
            {showRating ? <Rating value={product.rating} count={product.reviewCount} /> : null}

            <p className="gd-mono flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] tracking-[0.02em] text-[var(--f2)]">
              {availabilityLine(product)}
              {product.compareAtPrice ? (
                <span className="tabular normal-case tracking-normal text-grey-400 line-through" data-testid="card-compare-price">
                  {formatPrice(product.compareAtPrice)}
                </span>
              ) : null}
            </p>

            {/* The price never shrinks: at 375px a two-column card is ~170px wide. */}
            <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
              <p
                className="gd-display-wide tabular shrink-0 whitespace-nowrap text-[1.25rem] font-bold leading-none sm:text-[1.5rem]"
                data-testid="card-price"
              >
                {formatPrice(product.price)}
              </p>
              <span className="relative z-20">
                {family ? (
                  <Link
                    href={`/prodotto/${product.slug}`}
                    data-testid="choose-colour"
                    aria-label={`Scegli il colore: ${family.familyName}`}
                    className="gd-chamfer inline-flex size-11 shrink-0 items-center justify-center bg-white/[0.09] text-graphite transition-colors duration-200 hover:bg-lime hover:text-void"
                  >
                    <Palette className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <AddToCartButton slug={product.slug} name={product.name} stock={product.stock} compact />
                )}
              </span>
            </div>
          </div>

          <div aria-hidden="true" className="gd-holo-shine" />
          <div aria-hidden="true" className="gd-holo-sparkle" />
          <div aria-hidden="true" className="gd-holo-glare" />
        </div>
      </article>
    </HoloSurface>
  );
}
