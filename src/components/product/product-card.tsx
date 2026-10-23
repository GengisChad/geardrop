import Image from "next/image";
import Link from "next/link";
import { Palette } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { WishlistButton } from "@/components/product/wishlist-button";
import { PromoBadge, RankBadge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { cutoutSrc } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, bladeName, displayName, holoStyle, partCode, partMark } from "@/lib/holo";
import { BLADE_TYPE_LABEL } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";
import { familyColours } from "@/lib/commerce/variants";
import { cn } from "@/lib/cn";

/**
 * Availability speaks in the shop's status colours, never the product's palette: a red
 * "Disponibile" read as a problem and a lime "Esaurito" read as in stock (critique, 2026-10-11).
 * A sold-out release keeps the pre-order colour, as on its product page.
 */
function availabilityTone(product: Pick<Product, "stock" | "releasePreorder">): string {
  if (product.stock === "disponibile") return "text-available";
  if (product.stock === "esaurito") return product.releasePreorder ? "text-preorder" : "text-soldout";
  return "text-preorder";
}

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
 * X-Rail catalogue card. The cut-out packshot stands on a plate tinted with the pack's own
 * colour, its ratchet number printed large behind it; the name is split from its part code.
 * On hover the rim lights lime and the top turns a few degrees. The whole card links to the
 * product, while the cart and wishlist buttons stay on top.
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
  // An item sold in several colours has one card for all of them: it names the item, shows
  // the colours, and sends the shopper to pick one instead of adding the card's own colour.
  const colours = familyColours(product);
  const family = colours.length > 1 ? product.variant : undefined;
  const code = family ? null : partCode(product);
  const mark = partMark(code);
  const name = family?.familyName ?? bladeName(product.name, code);

  return (
    <article
      data-testid="product-card"
      data-slug={product.slug}
      style={holoStyle(product)}
      className={cn(
        "group relative flex h-full flex-col border border-white/10 bg-surface transition-colors duration-200 hover:border-lime",
        className,
      )}
    >
      <div className="gd-product-plate aspect-square shrink-0 overflow-hidden">
        {mark ? (
          <span aria-hidden="true" className="gd-watermark left-2 top-1 text-[2.35rem] sm:left-3 sm:text-[3rem]">
            {mark}
          </span>
        ) : null}
        {image ? (
          <Image
            src={cutout ?? image.src}
            alt={image.alt}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 46vw"
            className={cn(
              "object-contain drop-shadow-[0_14px_14px_rgba(0,0,0,0.55)] transition-[rotate,scale] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "group-hover:-rotate-[5deg] group-hover:scale-[1.04] motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100",
              cutout ? "p-2 pt-4" : "p-6",
            )}
          />
        ) : null}
        {rank !== undefined ? (
          <span className="pointer-events-none absolute left-2 top-2 z-20">
            <RankBadge rank={rank} />
          </span>
        ) : null}
        {promo ? (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 sm:bottom-3 sm:left-3">
            <PromoBadge tag={promo} className="max-sm:px-1.5 max-sm:text-[0.625rem]" />
          </span>
        ) : null}
        <span className="absolute right-1.5 top-1.5 z-20 sm:right-2 sm:top-2">
          <WishlistButton slug={product.slug} name={product.name} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3.5">
        {code || product.bladeType ? (
          <p className="flex min-w-0 items-center gap-1.5">
            {code ? <span className="gd-code px-1.5 pb-[3px] pt-1 text-[0.625rem] sm:text-[0.6875rem]">{code}</span> : null}
            {product.bladeType ? (
              <span className="gd-display truncate text-[0.625rem] font-bold tracking-[0.07em] text-grey-600 sm:text-[0.6875rem]">
                {BLADE_TYPE_LABEL[product.bladeType]}
              </span>
            ) : null}
          </p>
        ) : null}

        <h3 className="gd-name text-[1rem] font-bold leading-[1.02] sm:text-[1.2rem]">
          {/* Stretched link: the whole card is the hit target, but the buttons stay on top. */}
          <Link href={`/prodotto/${product.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
            {displayName(name)}
          </Link>
        </h3>
        {family ? (
          <p className="flex items-center gap-1" data-testid="card-colours">
            {colours.map((colour) => (
              <span
                key={colour.slug}
                aria-hidden="true"
                className="size-2.5 ring-1 ring-inset ring-black/25"
                style={{ backgroundColor: colour.swatch }}
              />
            ))}
            <span className="ml-1 text-[0.6875rem] text-grey-600">{colours.length} colori</span>
          </p>
        ) : null}

        {showTagline ? <p className="hidden text-small leading-snug text-grey-600 sm:line-clamp-2">{product.tagline}</p> : null}
        {showRating ? <Rating value={product.rating} count={product.reviewCount} /> : null}

        <p
          className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] font-medium leading-tight", availabilityTone(product))}
          data-testid="card-availability"
        >
          <span aria-hidden="true" className="gd-dot size-2" />
          {/* "pre-ordine" never breaks at its hyphen on a narrow card. */}
          {displayName(availabilityLine(product))}
          {product.compareAtPrice ? (
            <span className="tabular text-grey-400 line-through" data-testid="card-compare-price">
              {formatPrice(product.compareAtPrice)}
            </span>
          ) : null}
        </p>

        {/* The price never shrinks: at 375px a two-column card is ~170px wide. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <p
            className="gd-display-wide tabular shrink-0 whitespace-nowrap text-[1.2rem] font-extrabold leading-none [font-stretch:118%] sm:text-[1.5rem]"
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
                className="gd-chamfer inline-flex h-11 w-12 shrink-0 items-center justify-center bg-surface-2 text-lime transition-colors duration-200 hover:bg-lime hover:text-void"
              >
                <Palette className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <AddToCartButton slug={product.slug} name={product.name} priceCents={product.price.amount} stock={product.stock} compact />
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
