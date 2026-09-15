"use client";

import Image from "next/image";
import { useState } from "react";
import { Rocket } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/ui/kicker";
import { impactArt, productTops } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { availabilityLine, displayName, kindLabel, productLine, shortName } from "@/lib/holo";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

const SPEC_LABELS = ["Tipo", "Linea", "Codice", "Componenti"] as const;

/**
 * "Scegli. Carica. Lancia." — pick a new release and watch its top drop into the stadium,
 * spiral in along the Xtreme Line and keep spinning at the centre. Each launch remounts the
 * animated nodes (their key changes), which restarts the CSS animation from the drop.
 *
 * Only products with a cropped top (data/assets.ts `productTops`) can enter; with none the
 * section renders nothing.
 */
export function Arena({ products }: { readonly products: readonly Product[] }) {
  const contenders = products.flatMap((product) => {
    const top = productTops[product.slug];
    return top ? [{ product, top }] : [];
  });
  const [selected, setSelected] = useState<string | undefined>(contenders[0]?.product.slug);
  const [launch, setLaunch] = useState(0);

  const active = contenders.find((entry) => entry.product.slug === selected) ?? contenders[0];
  if (!active) return null;

  const { product, top } = active;
  const line = productLine(product);
  const specs = SPEC_LABELS.flatMap((label) => product.specs.filter((spec) => spec.label === label).slice(0, 1));
  const pick = (slug: string) => {
    setSelected(slug);
    setLaunch((count) => count + 1);
  };

  return (
    <section
      aria-labelledby="arena-title"
      data-testid="arena"
      className="relative mx-auto max-w-[1400px] overflow-x-clip px-4 pt-16 sm:px-6 lg:px-10 lg:pt-24"
    >
      <Kicker>Arena</Kicker>
      <h2 id="arena-title" className="gd-display-wide mt-3 text-[2.6rem] font-bold leading-[0.92] sm:text-[3.5rem] lg:text-[4.25rem]">
        Scegli. Carica. <span className="gd-holo-text">Lancia.</span>
      </h2>
      <p className="mt-3 max-w-md text-body text-grey-600">Scegli una nuova uscita e mandala nello stadio.</p>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-center gap-4 lg:mt-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
        <div className="gd-stadium" aria-hidden="true">
          <div className="gd-bowl">
            <div className="gd-bowl-rim" />
            <div key={`line-${launch}`} className="gd-xline animate-[gd-xline_1.4s_ease-out_0.45s_both]" />
            <div key={`orbit-${launch}-${product.slug}`} className="gd-orbit">
              <div className="gd-arm">
                <div className="gd-top-shadow" />
                <div className="gd-wake" />
                <div className="gd-spinner">
                  <Image src={top} alt="" width={360} height={360} sizes="170px" className="size-full" />
                </div>
              </div>
            </div>
          </div>
          <Image
            key={`burst-${launch}`}
            src={impactArt.src}
            alt=""
            width={impactArt.width}
            height={impactArt.height}
            sizes="360px"
            className="gd-burst"
          />
        </div>

        <div className="gd-hud p-5 sm:p-8">
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {contenders.map((entry) => {
              const on = entry.product.slug === product.slug;
              return (
                <button
                  key={entry.product.slug}
                  type="button"
                  onClick={() => pick(entry.product.slug)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-24 flex-col items-center justify-center gap-1.5 border border-white/10 bg-white/[0.03] px-1 text-center text-[0.75rem] font-semibold leading-tight transition-[border-color,background-color,box-shadow] duration-200 hover:border-white/30",
                    "sm:h-16 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3 sm:text-left sm:text-[0.8125rem]",
                    on && "border-lime bg-lime/[0.08] shadow-[inset_0_0_0_1px_#c6ff00,0_0_24px_-6px_rgba(198,255,0,0.5)]",
                  )}
                >
                  <Image
                    src={entry.top}
                    alt=""
                    width={84}
                    height={84}
                    className={cn("size-10 shrink-0 animate-[gd-spin_3s_linear_infinite]", on && "[animation-duration:0.45s]")}
                  />
                  <span>{shortName(entry.product.name)}</span>
                </button>
              );
            })}
          </div>

          <p className="gd-mono mt-6 text-[0.75rem] uppercase tracking-[0.16em] text-lime">
            {[line, kindLabel(product)].filter(Boolean).join(" · ")}
          </p>
          <h3 className="gd-display-wide mt-2 text-[2.1rem] font-bold leading-[0.95] sm:text-[2.875rem]">{displayName(product.name)}</h3>
          <p className="mt-2.5 text-body text-grey-600">{product.tagline}</p>

          {specs.length > 0 ? (
            <dl className="mt-5 grid grid-cols-2 gap-x-5 border-t border-white/10">
              {specs.map((spec) => (
                <div key={spec.label} className="flex flex-col gap-1 border-b border-white/10 py-3.5">
                  <dt className="gd-mono text-[0.6875rem] uppercase tracking-[0.14em] text-grey-400">{spec.label}</dt>
                  <dd className="text-[0.9375rem] font-semibold">{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
            <div>
              <p className="gd-display-wide tabular text-[2.75rem] font-bold leading-none">{formatPrice(product.price)}</p>
              <p className="gd-mono mt-1.5 text-[0.75rem] uppercase tracking-[0.1em] text-lime">{availabilityLine(product)}</p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 whitespace-nowrap sm:flex sm:items-center lg:grid xl:flex">
              <Button variant="glass" onClick={() => setLaunch((count) => count + 1)}>
                <Rocket className="size-4" aria-hidden="true" />
                Lancia
              </Button>
              <div className="gd-glow">
                <AddToCartButton slug={product.slug} name={product.name} stock={product.stock} emphasis="primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
