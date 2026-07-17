import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { WishlistButton } from "@/components/product/wishlist-button";
import { PromoBadge, RankBadge, StockBadge, TypeBadge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { formatPrice } from "@/lib/format";
import { BLADE_TYPE_LABEL } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type ProductCardProps = {
  product: Product;
  /** "PIÙ VENDUTI" numbers its cards. */
  rank?: number;
  showRating?: boolean;
  showTagline?: boolean;
  priority?: boolean;
  className?: string;
};

/**
 * Card variants come from design system §09: STANDARD / HOVER / OUT OF STOCK / PRE-ORDINE.
 * Hover = violet border + lime CTA; the CTA itself is driven by stock via AddToCartButton.
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
  const promo = product.tags[0];

  return (
    <article
      data-testid="product-card"
      data-slug={product.slug}
      className={cn(
        "gd-glass-card gd-glass-interactive group relative flex flex-col overflow-hidden rounded-[--radius-glass]",
        className,
      )}
    >
      <div className="relative">
        {/* The glass surface is 85% white, so it reads as the light plate every mockup
            puts the product on (audit §7.6) while the ambient field glows faintly through. */}
        <div className="relative aspect-[4/3] overflow-hidden">
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
              className="object-contain p-5 transition-transform duration-500 ease-[--ease-out-gear] group-hover:scale-[1.06]"
            />
          ) : null}
        </div>

        {/* z-20 keeps the heart above the stretched link below: both are positioned with
            auto z-index, and the link's ::after comes later in the DOM, so without this
            it paints on top and swallows every click on the wishlist button. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5">
            {rank !== undefined ? <RankBadge rank={rank} /> : null}
            {promo ? <PromoBadge tag={promo} /> : null}
            {rank === undefined && !promo && product.bladeType ? (
              <TypeBadge>{BLADE_TYPE_LABEL[product.bladeType]}</TypeBadge>
            ) : null}
          </span>
          <span className="pointer-events-auto">
            <WishlistButton slug={product.slug} name={product.name} />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        <h3 className="text-small font-bold leading-tight text-graphite sm:text-[0.9375rem]">
          {/* Stretched link: the whole card is the hit target, but the CTA stays on top. */}
          <Link href={`/prodotto/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        {showTagline ? <p className="line-clamp-2 text-small text-grey-600">{product.tagline}</p> : null}
        {showRating ? <Rating value={product.rating} count={product.reviewCount} /> : null}

        {/* Wraps and never shrinks the price: at 375px a two-column card is ~170px wide,
            and a nowrap row let the card's overflow-hidden clip "€24,99" to "€24,9". */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <StockBadge status={product.stock} />
          <p className="tabular gd-display shrink-0 text-body font-bold text-graphite" data-testid="card-price">
            {formatPrice(product.price)}
          </p>
        </div>
      </div>

      <div className="relative z-10 px-3 pb-3">
        <AddToCartButton slug={product.slug} name={product.name} stock={product.stock} size="sm" />
      </div>
    </article>
  );
}
