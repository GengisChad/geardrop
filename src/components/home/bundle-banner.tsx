import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discountPercent, formatPrice } from "@/lib/format";
import type { Bundle, Product } from "@/lib/commerce/types";

/**
 * "BUNDLE CAMPIONE" banner from mockup-home-lower. The only dark surface a product
 * sits on, so the cut-out needs a glow behind it to read. (audit §7.6)
 */
export function BundleBanner({ bundle, hero }: { bundle: Bundle; hero: Product }) {
  const image = hero.images[0];
  const percent = discountPercent(bundle.price, bundle.compareAtPrice);
  const saving = bundle.compareAtPrice.amount - bundle.price.amount;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
      <div
        data-testid="bundle-glass"
        className="gd-glass-dark gd-editorial-panel relative overflow-hidden rounded-[--radius-glass-lg]"
      >
        <div className="gd-streaks absolute inset-0 opacity-70" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="absolute -left-20 top-1/2 size-96 -translate-y-1/2 rounded-full bg-violet/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute right-1/4 top-1/2 size-[26rem] -translate-y-1/2 rounded-full bg-lime/8 blur-3xl"
        />

        <div className="relative grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:p-12">
          <div>
            <p className="gd-display text-small font-bold italic tracking-[0.2em] text-grey-400">{bundle.eyebrow}</p>

            <h2 className="gd-display-wide mt-3 text-[2rem] font-extrabold leading-[0.98] sm:text-[2.75rem]">
              <span className="block text-white">{bundle.title[0]}</span>{" "}
              <span className="block text-lime">{bundle.title[1]}</span>
            </h2>

            <p className="mt-4 max-w-md text-small leading-relaxed text-grey-400">{bundle.description}</p>

            <div className="mt-6 flex flex-wrap items-baseline gap-3">
              <p className="tabular gd-display text-[2rem] font-extrabold text-white">{formatPrice(bundle.price)}</p>
              <p className="tabular text-body text-grey-400 line-through">{formatPrice(bundle.compareAtPrice)}</p>
              <p className="gd-display rounded-full bg-violet px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-white">
                −{percent}%
              </p>
            </div>

            <Button as={Link} href={`/prodotto/${bundle.heroSlug}`} variant="primary" size="lg" className="mt-7">
              Acquista ora
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="gd-product-plate relative rounded-[--radius-glass] bg-graphite/35 p-4">
            {image ? (
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                sizes="(min-width: 1024px) 520px, 90vw"
                className="mx-auto h-auto w-full max-w-[520px] object-contain"
              />
            ) : null}

            <p className="gd-glass-dark gd-display absolute -bottom-2 right-0 flex size-24 flex-col items-center justify-center rounded-full text-center text-[0.625rem] font-bold tracking-wider text-grey-400 sm:size-28">
              Risparmi
              <span className="tabular mt-0.5 block text-body font-extrabold text-white sm:text-h3">
                {formatPrice({ amount: saving, currency: "EUR" })}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
