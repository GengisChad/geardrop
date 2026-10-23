import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { WishlistButton } from "@/components/product/wishlist-button";
import { PromoBadge } from "@/components/ui/badge";
import { BRANDS, brandOf } from "@/data/catalog";
import { cutoutSrc } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, bladeName, displayName, holoStyle, partCode, partMark } from "@/lib/holo";
import { BLADE_TYPE_LABEL, STANDARD_DELIVERY, preorderDelivery, stockHint } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/** The specs worth a glance on the feature, in this order, when the product has them. */
const FEATURE_SPECS = ["Tipo", "Codice", "Componenti"] as const;

/**
 * One product as a wide feature: the plate on one side, name, specs, price and the cart on
 * the other. A shelf with a single product uses it, so "Appena arrivati" never shows a lone
 * card beside an empty tile (critique, 2026-10-11). It is still a product card for the page.
 */
export function ProductFeature({ product }: { readonly product: Product }) {
  const image = product.images[0];
  const cutout = image ? cutoutSrc(image.src) : null;
  const promo = product.tags[0];
  const code = partCode(product);
  const mark = partMark(code);
  const brand = BRANDS.find((entry) => entry.slug === brandOf(product))?.name;
  const kind = product.bladeType ? BLADE_TYPE_LABEL[product.bladeType] : null;
  const specs = FEATURE_SPECS.flatMap((label) => {
    const spec = product.specs.find((entry) => entry.label === label);
    return spec ? [spec] : [];
  });
  const available = product.stock === "disponibile";
  const delivery = available
    ? STANDARD_DELIVERY
    : product.stock === "pre-ordine"
      ? preorderDelivery(product.releasePreorder)
      : stockHint(product);

  return (
    <article
      data-testid="product-card"
      data-slug={product.slug}
      style={holoStyle(product)}
      className="group relative grid border border-white/10 bg-surface transition-colors duration-200 hover:border-lime md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
    >
      <div className="gd-product-plate relative aspect-[1/0.86] overflow-hidden md:aspect-auto md:min-h-[29rem]">
        {mark ? (
          <span
            aria-hidden="true"
            className="gd-watermark left-3 top-1 text-[6.5rem] [-webkit-text-stroke-width:1.6px] sm:left-6 sm:top-2 sm:text-[11rem] sm:[-webkit-text-stroke-width:2px] md:text-[8rem] lg:text-[11rem] xl:text-[12.5rem]"
          >
            {mark}
          </span>
        ) : null}
        {image ? (
          <Image
            src={cutout ?? image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className={cn(
              "object-contain p-6 drop-shadow-[0_24px_24px_rgba(0,0,0,0.55)] transition-[rotate,scale] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-12",
              "group-hover:-rotate-[3deg] group-hover:scale-[1.03] motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100",
            )}
          />
        ) : null}
        {promo ? (
          <span className="pointer-events-none absolute bottom-4 left-4 z-20 sm:bottom-6 sm:left-6">
            <PromoBadge tag={promo} />
          </span>
        ) : null}
        <span className="absolute right-3 top-3 z-20">
          <WishlistButton slug={product.slug} name={product.name} />
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5 p-4 sm:gap-4 sm:p-8 lg:p-11">
        {code || brand ? (
          <p className="flex flex-wrap items-center gap-2.5">
            {code ? <span className="gd-code px-2 pb-1 pt-1.5 text-[0.75rem] sm:text-small">{code}</span> : null}
            <span className="gd-display text-[0.6875rem] font-bold tracking-[0.07em] text-grey-600 sm:text-[0.75rem]">
              {[brand, kind].filter(Boolean).join(" · ")}
            </span>
          </p>
        ) : null}

        <h3 className="gd-display-wide text-[2.2rem] font-extrabold leading-[0.92] sm:text-[3rem] md:text-[2.4rem] lg:text-[3rem] xl:text-[3.6rem]">
          <Link href={`/prodotto/${product.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
            {displayName(bladeName(product.name, code))}
          </Link>
        </h3>
        <p className="max-w-[38ch] text-body leading-relaxed text-grey-700 sm:text-[1.1875rem]">{product.tagline}</p>

        {specs.length ? (
          <dl className="hidden grid-cols-3 border-y border-white/10 sm:grid">
            {specs.map((spec, index) => (
              <div key={spec.label} className={cn("flex flex-col gap-1 py-3.5 pr-4", index > 0 && "border-l border-white/10 pl-4")}>
                <dt className="gd-display text-[0.6875rem] font-bold tracking-[0.07em] text-grey-600">{spec.label}</dt>
                <dd className={cn("text-[0.9375rem] leading-snug", spec.label === "Codice" && "gd-mono")}>{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-col gap-1">
          <p
            data-testid="card-availability"
            className={cn("flex items-center gap-2 text-[0.875rem] font-medium sm:text-body", available ? "text-available" : "text-preorder")}
          >
            <span aria-hidden="true" className="gd-dot" />
            {displayName(availabilityLine(product))}
          </p>
          <p className="text-small text-grey-600">{delivery}</p>
        </div>

        <div className="relative z-20 mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
          <p className="flex items-baseline gap-2.5">
            <span data-testid="card-price" className="gd-display-wide tabular text-[2rem] font-extrabold leading-none [font-stretch:120%] sm:text-[2.75rem]">
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice ? (
              <span data-testid="card-compare-price" className="tabular text-body text-grey-400 line-through">
                {formatPrice(product.compareAtPrice)}
              </span>
            ) : null}
          </p>
          <div className="min-w-[13rem] flex-1">
            <AddToCartButton
              slug={product.slug}
              name={product.name}
              priceCents={product.price.amount}
              stock={product.stock}
              size="lg"
              emphasis="primary"
              label={product.stock === "pre-ordine" ? "Pre-ordina" : "Aggiungi al carrello"}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
