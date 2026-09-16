"use client";

import Image from "next/image";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { HoloSurface } from "@/components/holo/holo-surface";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { brand, brandSize, cutoutSrc } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, displayName, holoStyle, productLine } from "@/lib/holo";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type HoloCardProps = {
  readonly product: Product;
  /** 1-based place in the set, printed as "01/03". */
  readonly position: number;
  readonly total: number;
  readonly flipped: boolean;
  readonly onFlip: () => void;
  /** The one card in view that shimmers without a pointer. */
  readonly auto?: boolean;
  readonly priority?: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The trading card the hero deals: a foil front with the packshot, and a back with the
 * product sheet and the pre-order action. The inactive face is inert, so keyboard focus
 * never lands on a button that is facing away.
 */
export function HoloCard({ product, position, total, flipped, onFlip, auto = false, priority = false }: HoloCardProps) {
  const image = product.images[0];
  const cutout = image ? cutoutSrc(image.src) : null;
  const line = productLine(product);
  const kicker = ["Scheda", line].filter(Boolean).join(" · ");
  const flip = (event: React.MouseEvent) => {
    event.stopPropagation();
    onFlip();
  };

  return (
    <HoloSurface
      data-testid="holo-card"
      data-slug={product.slug}
      className={cn("gd-holo-touch h-full", auto && "gd-holo-auto")}
      style={holoStyle(product)}
    >
      <div className="gd-holo-bob">
        <div className="gd-holo-flip" data-flipped={flipped ? "true" : "false"}>
          <div className="gd-holo-rot">
            <div className="gd-holo-face" inert={flipped}>
              <div aria-hidden="true" className="gd-holo-ring" />
              <div className="absolute inset-3 z-[1] flex flex-col gap-2.5">
                <div className="flex h-[1.625rem] items-center justify-end gap-2">
                  <span className="gd-mono text-[0.6875rem] tracking-[0.12em] text-white/50">
                    {pad(position)}/{pad(total)}
                    {line ? ` · ${line}` : ""}
                  </span>
                </div>

                <div className="gd-holo-art min-h-0 flex-1">
                  <span aria-hidden="true" className="gd-holo-orb" />
                  {image ? (
                    <Image
                      src={cutout ?? image.src}
                      alt={image.alt}
                      fill
                      priority={priority}
                      sizes="340px"
                      className={cn("gd-holo-img object-contain", cutout ? "p-2" : "p-8")}
                    />
                  ) : null}
                  {line ? (
                    <span
                      aria-hidden="true"
                      className="gd-display-wide gd-outline-text absolute bottom-1 left-3 text-[3.25rem] font-bold leading-none"
                    >
                      {line}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={flip}
                    aria-label={`Gira la carta di ${product.name}`}
                    className="absolute right-2.5 top-2.5 z-[5] grid size-11 place-items-center rounded-full border border-white/20 bg-void/75 text-graphite transition-[background-color,color,transform] duration-500 hover:rotate-180 hover:bg-lime hover:text-void"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 px-1">
                  <h3 className="gd-display-wide text-[1.4rem] font-bold leading-none sm:text-[1.55rem]">
                    <Link
                      href={`/prodotto/${product.slug}`}
                      onClick={(event) => event.stopPropagation()}
                      className="transition-colors hover:text-lime"
                    >
                      {displayName(product.name)}
                    </Link>
                  </h3>
                  <p className="line-clamp-1 text-small text-grey-600">{product.tagline}</p>
                  <div className="mt-1 flex items-end justify-between gap-2 border-t border-white/10 pt-2.5">
                    <span className="gd-display-wide tabular text-[1.75rem] font-bold leading-none sm:text-[2rem]">
                      {formatPrice(product.price)}
                    </span>
                    <span className="gd-mono pb-1 text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--f2)]">
                      {availabilityLine(product)}
                    </span>
                  </div>
                </div>
              </div>
              <div aria-hidden="true" className="gd-holo-shine" />
              <div aria-hidden="true" className="gd-holo-sparkle" />
              <div aria-hidden="true" className="gd-holo-glare" />
            </div>

            <div className="gd-holo-face gd-holo-back" inert={!flipped}>
              <div aria-hidden="true" className="gd-holo-ring" />
              <div className="absolute inset-0 z-[1] flex flex-col gap-3 overflow-hidden bg-[radial-gradient(90%_60%_at_50%_0%,color-mix(in_oklab,var(--f3)_35%,transparent),transparent_70%)] px-5 pb-4 pt-6">
                <Image
                  src={brand.emblem}
                  alt=""
                  aria-hidden="true"
                  width={brandSize.emblem.width}
                  height={brandSize.emblem.height}
                  sizes="288px"
                  className="pointer-events-none absolute -bottom-16 -right-20 w-72 opacity-10 animate-[gd-spin_30s_linear_infinite]"
                />
                <p className="gd-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--f2)]">{kicker}</p>
                <p className="gd-display-wide text-[1.8rem] font-bold leading-[0.95]">{displayName(product.name)}</p>
                <p className="line-clamp-5 text-small leading-relaxed text-grey-700">{product.description}</p>
                {product.boxContents.length > 0 ? (
                  <ul className="gd-mono flex flex-col gap-2 border-t border-white/10 pt-3 text-[0.75rem] text-grey-600">
                    {product.boxContents.slice(0, 3).map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 bg-[var(--f2)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="relative z-[5] mt-auto flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <AddToCartButton
                      slug={product.slug}
                      name={product.name}
                      stock={product.stock}
                      emphasis="primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={flip}
                    aria-label={`Torna al fronte di ${product.name}`}
                    className="grid size-12 shrink-0 place-items-center rounded-full border border-white/20 bg-void/75 text-graphite transition-colors hover:bg-lime hover:text-void"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div aria-hidden="true" className="gd-holo-shine" />
              <div aria-hidden="true" className="gd-holo-glare" />
            </div>
          </div>
        </div>
      </div>
    </HoloSurface>
  );
}
