import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Kicker } from "@/components/ui/kicker";
import { cutoutSrc } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, holoStyle, shortName } from "@/lib/holo";
import { isPurchasable } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";

/**
 * "Take them together": on a pack's own page, the bundle it belongs to, with what the second
 * pack costs inside the bundle. Rendered outside the buy panel so the page keeps one primary
 * add-to-cart for the product itself.
 */
export function BundleOffer({
  bundle,
  current,
  partners,
}: {
  readonly bundle: Product;
  readonly current: Product;
  readonly partners: readonly Product[];
}) {
  if (!bundle.compareAtPrice || partners.length === 0) return null;

  const saving = bundle.compareAtPrice.amount - bundle.price.amount;
  const extra = bundle.price.amount - current.price.amount;
  const partnerNames = partners.map((partner) => shortName(partner.name)).join(" e ");
  const partnerLabel = partners.map((partner, index) => (
    <span key={partner.slug} style={holoStyle(partner)}>
      {index > 0 ? " e " : null}
      <span className="text-[var(--f2)]">{shortName(partner.name)}</span>
    </span>
  ));
  const image = bundle.images[0];

  return (
    <section
      aria-labelledby="bundle-offer-title"
      data-testid="bundle-offer"
      style={holoStyle(bundle)}
      className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6"
    >
      <div className="gd-hud relative isolate grid items-center gap-6 overflow-hidden p-5 sm:p-8 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]">
        <div aria-hidden="true" className="gd-duo-offer-glow" />
        <div aria-hidden="true" className="relative mx-auto aspect-square w-48 sm:w-56 md:w-full">
          {image ? (
            <Image
              src={cutoutSrc(image.src) ?? image.src}
              alt=""
              fill
              sizes="240px"
              className="object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)]"
            />
          ) : null}
        </div>

        <div className="min-w-0">
          <Kicker>Offerta duo</Kicker>
          <h2 id="bundle-offer-title" className="gd-display-wide mt-3 text-[1.6rem] font-bold leading-[0.98] sm:text-[2.1rem]">
            Prendilo insieme a {partnerLabel}
          </h2>
          <p className="mt-2.5 max-w-xl text-body text-grey-600">
            Con il duo {partnerNames} ti costa{" "}
            <strong className="text-graphite">{formatPrice({ amount: extra, currency: "EUR" })}</strong> invece di{" "}
            {formatPrice(partners.reduce((sum, partner) => ({ amount: sum.amount + partner.price.amount, currency: "EUR" }), { amount: 0, currency: "EUR" }))}.
          </p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="gd-display-wide tabular text-[2.25rem] font-bold leading-none">{formatPrice(bundle.price)}</span>
            <span className="tabular text-body text-grey-400 line-through">{formatPrice(bundle.compareAtPrice)}</span>
            <span className="gd-chamfer gd-display bg-lime px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-void">
              Risparmi {formatPrice({ amount: saving, currency: "EUR" })}
            </span>
          </div>
          <p className="gd-mono mt-2 text-[0.75rem] uppercase tracking-[0.1em] text-lime">{availabilityLine(bundle)}</p>
        </div>

        <div className="flex flex-col gap-2.5 md:w-60">
          <div className={isPurchasable(bundle.stock) ? "gd-glow" : undefined}>
            <AddToCartButton slug={bundle.slug} name={bundle.name} stock={bundle.stock} emphasis="primary" label="Aggiungi il duo" />
          </div>
          <Link
            href={`/prodotto/${bundle.slug}`}
            className="gd-display inline-flex h-12 items-center justify-center gap-2 border border-white/15 text-small font-bold tracking-[0.08em] text-graphite transition-colors hover:border-lime hover:text-lime"
          >
            Scopri il duo
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
