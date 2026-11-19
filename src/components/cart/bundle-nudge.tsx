"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { productTops } from "@/data/assets";
import { useToast } from "@/components/ui/toast";
import { bestBundleOffer, bundleOffers } from "@/lib/commerce/bundle-offer";
import { formatPrice } from "@/lib/format";
import { shortName } from "@/lib/holo";
import { useCart } from "@/lib/store/cart";
import type { CartQuoteLine, Product } from "@/lib/commerce/types";

const NAME_BY_SLUG = new Map(PRODUCTS.map((product) => [product.slug as string, product]));

const LIST = new Intl.ListFormat("it", { style: "long", type: "conjunction" });

/**
 * In the cart, the bundle the shopper is closest to (see lib/commerce/bundle-offer.ts): with every
 * piece already there it offers to swap them for the bundle at its lower price; with some of them,
 * what the rest costs inside it. One offer only: a piece can sit in several bundles, and a box for
 * each buried the cart on a phone (owner, 2026-11-19).
 * Prices come from the priced quote for what is in the cart and, for the rest, from the live
 * catalogue the cart page passes (the back office sets prices since 2026-11-19), else the catalogue.
 */
export function BundleNudge({
  lines,
  catalogue = [],
}: {
  readonly lines: readonly CartQuoteLine[];
  /** Bundles and their packs at today's prices, as the storefront serves them. */
  readonly catalogue?: readonly Product[];
}) {
  const swap = useCart((state) => state.swapIntoBundle);
  const toast = useToast();
  const live = new Map(catalogue.map((product) => [product.slug as string, product]));
  const priceOf = (slug: string) => (live.get(slug) ?? NAME_BY_SLUG.get(slug))?.price.amount ?? 0;

  const offer = bestBundleOffer(
    bundleOffers(
      lines,
      BUNDLES.map((bundle) => live.get(bundle.slug) ?? bundle),
      priceOf,
    ),
  );
  if (!offer) return null;

  const { bundle, components, missing, extra, missingCost, saving } = offer;
  const complete = missing.length === 0;
  // Two pieces are a duo; the decks, kits and packs go by their own name.
  const duo = components.length === 2;
  const missingNames = LIST.format(missing.map((component) => shortName(NAME_BY_SLUG.get(component.slug)?.name ?? component.slug)));
  const page = (
    <Link href={`/prodotto/${bundle.slug}`} className="font-bold underline-offset-2 hover:underline">
      {duo ? "duo" : `set ${bundle.name}`}
    </Link>
  );

  return (
    <div data-testid="bundle-nudge" data-slug={bundle.slug} className="gd-hud relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div aria-hidden="true" className="flex shrink-0 items-center">
        {components.map((component, index) => {
          const top = productTops[component.slug];
          return top ? (
            <Image
              key={component.slug}
              src={top}
              alt=""
              width={64}
              height={64}
              className={index === 0 ? "size-12 animate-[gd-spin_1.4s_linear_infinite]" : "-ml-3 size-12 animate-[gd-spin_1.1s_linear_infinite_reverse]"}
            />
          ) : null;
        })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="gd-mono flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-lime">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {duo ? "Offerta duo" : "Offerta set"}
        </p>
        <p className="mt-1 text-small leading-snug text-graphite" data-testid="bundle-nudge-text">
          {complete ? (
            <>
              Li hai già {duo ? "entrambi" : "tutti"}: passa al {page} e risparmi{" "}
              <strong className="whitespace-nowrap text-lime">{formatPrice({ amount: saving, currency: "EUR" })}</strong>.
            </>
          ) : (
            <>
              Aggiungi {missingNames} con il {page}:{" "}
              <strong className="whitespace-nowrap text-lime">+{formatPrice({ amount: extra, currency: "EUR" })}</strong> invece di{" "}
              <span className="whitespace-nowrap">+{formatPrice({ amount: missingCost, currency: "EUR" })}</span>.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        data-testid="bundle-nudge-swap"
        onClick={() => {
          swap(bundle.slug, components);
          toast.push({ tone: "success", message: `${bundle.name} nel carrello.` });
        }}
        className="gd-chamfer gd-display inline-flex h-11 shrink-0 items-center justify-center bg-lime px-4 text-small font-bold tracking-[0.08em] text-void transition-colors hover:bg-[#d8ff4d]"
      >
        {complete ? (duo ? "Passa al duo" : "Passa al set") : duo ? "Completa il duo" : "Completa il set"}
      </button>
    </div>
  );
}
