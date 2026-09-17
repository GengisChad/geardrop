import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Kicker } from "@/components/ui/kicker";
import { impactArt, packBoxes, productTops } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, holoStyle, kindLabel, productLine, shortName } from "@/lib/holo";
import { isPurchasable } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/**
 * "Horus × Enlil": the duo offer on the homepage. The two packs lean in from their own colour
 * fields while their tops spin towards each other, clash with a spark and recoil. Everything
 * moves on transforms and opacity only; with reduced motion it holds the opening frame, packs
 * apart and no spark.
 */
export function DuoDrop({ bundle, packs }: { readonly bundle: Product; readonly packs: readonly Product[] }) {
  // Packs in the bundle's order: the first stands on the right, as in the duo packshot.
  const [right, left] = packs;
  if (!bundle.compareAtPrice || !left || !right) return null;

  const saving = bundle.compareAtPrice.amount - bundle.price.amount;
  const leftTop = productTops[left.slug];
  const rightTop = productTops[right.slug];
  const leftBox = packBoxes[left.slug];
  const rightBox = packBoxes[right.slug];

  return (
    <section
      aria-labelledby="duo-title"
      data-testid="duo-drop"
      className="relative mx-auto max-w-[1400px] overflow-x-clip px-4 pt-16 sm:px-6 lg:px-10 lg:pt-24"
    >
      <Kicker>Offerta duo</Kicker>
      <h2 id="duo-title" className="gd-display-wide mt-3 text-[2.6rem] font-bold leading-[0.92] sm:text-[3.5rem] lg:text-[4.25rem]">
        <span style={holoStyle(right)} className="text-[var(--f2)]">
          {shortName(right.name).split(" ").pop()}
        </span>{" "}
        <span className="gd-holo-text">×</span>{" "}
        <span style={holoStyle(left)} className="text-[var(--f2)]">
          {shortName(left.name).split(" ").pop()}
        </span>
      </h2>
      <p className="mt-3 max-w-lg text-body text-grey-600">
        Stamina contro bilanciata: due Infinity Starter nello stesso carrello, a {formatPrice(bundle.price)} invece di{" "}
        {formatPrice(bundle.compareAtPrice)}.
      </p>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-center gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
        <div className="gd-duo-stage" aria-hidden="true">
          <div className="gd-duo-field" />
          <div className="gd-duo-ring" />

          {leftBox ? (
            <Image src={leftBox.src} alt="" width={leftBox.width} height={leftBox.height} sizes="(min-width: 1024px) 280px, 40vw" className="gd-duo-pack gd-duo-pack--left" />
          ) : null}
          {rightBox ? (
            <Image src={rightBox.src} alt="" width={rightBox.width} height={rightBox.height} sizes="(min-width: 1024px) 280px, 40vw" className="gd-duo-pack gd-duo-pack--right" />
          ) : null}

          <div className="gd-duo-clash">
            <div className="gd-duo-floor" />
            <Image src={impactArt.src} alt="" width={impactArt.width} height={impactArt.height} sizes="320px" className="gd-duo-spark" />
            {leftTop ? (
              <div className="gd-duo-top gd-duo-top--left">
                <Image src={leftTop} alt="" width={240} height={240} sizes="130px" className="gd-duo-spin" />
              </div>
            ) : null}
            {rightTop ? (
              <div className="gd-duo-top gd-duo-top--right">
                <Image src={rightTop} alt="" width={240} height={240} sizes="130px" className="gd-duo-spin gd-duo-spin--reverse" />
              </div>
            ) : null}
          </div>

          <p className="gd-duo-sticker gd-chamfer gd-display">
            <span className="block text-[0.625rem] tracking-[0.18em]">Risparmi</span>
            <span className="tabular block text-[1.5rem] leading-none">{formatPrice({ amount: saving, currency: "EUR" })}</span>
          </p>
        </div>

        <div className="gd-hud p-5 sm:p-8" style={holoStyle(bundle)}>
          <p className="gd-mono text-[0.75rem] uppercase tracking-[0.16em] text-lime">Due starter · un solo prezzo</p>
          <h3 className="gd-display-wide mt-2 text-[1.9rem] font-bold leading-[0.95] sm:text-[2.5rem]">{bundle.name}</h3>

          <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[right, left].map((pack) => {
              const top = productTops[pack.slug];
              return (
                <li key={pack.slug} style={holoStyle(pack)}>
                  <Link
                    href={`/prodotto/${pack.slug}`}
                    className="flex h-full items-center gap-2.5 border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:border-[var(--f2)] sm:p-3"
                  >
                    {top ? <Image src={top} alt="" width={84} height={84} className="size-10 shrink-0 animate-[gd-spin_3s_linear_infinite] sm:size-12" /> : null}
                    <span className="min-w-0">
                      <span className="gd-mono block text-[0.625rem] uppercase tracking-[0.12em] text-[var(--f2)]">
                        {[productLine(pack), kindLabel(pack)].filter(Boolean).join(" · ")}
                      </span>
                      <span className="block text-[0.9375rem] font-semibold">{shortName(pack.name)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="gd-display-wide tabular text-[3rem] font-bold leading-none sm:text-[3.5rem]" data-testid="duo-price">
              {formatPrice(bundle.price)}
            </p>
            <p className="pb-1">
              <span className="tabular block text-body text-grey-400 line-through">{formatPrice(bundle.compareAtPrice)}</span>
              <span className="gd-mono block text-[0.75rem] uppercase tracking-[0.1em] text-lime">{availabilityLine(bundle)}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className={cn(isPurchasable(bundle.stock) && "gd-glow")}>
              <AddToCartButton
                slug={bundle.slug}
                name={bundle.name}
                stock={bundle.stock}
                size="lg"
                emphasis="primary"
                label={`Aggiungi il duo · ${formatPrice(bundle.price)}`}
              />
            </div>
            <Link
              href={`/prodotto/${bundle.slug}`}
              className="gd-display inline-flex h-[3.75rem] items-center justify-center gap-2 border border-white/20 bg-white/[0.03] text-[0.9375rem] font-bold tracking-[0.08em] text-graphite transition-colors hover:border-lime hover:text-lime"
            >
              Scopri il duo
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
