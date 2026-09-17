"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { productTops } from "@/data/assets";
import { useToast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/format";
import { shortName } from "@/lib/holo";
import { useCart } from "@/lib/store/cart";
import type { CartQuoteLine } from "@/lib/commerce/types";

const NAME_BY_SLUG = new Map(PRODUCTS.map((product) => [product.slug as string, product]));

/**
 * In the cart, a bundle the shopper is halfway into: with every pack already there it offers to
 * swap them for the bundle at its lower price; with some of them, what the rest costs inside it.
 * Prices come from the priced quote for what is in the cart and from the catalogue for the rest.
 */
export function BundleNudge({ lines }: { readonly lines: readonly CartQuoteLine[] }) {
  const swap = useCart((state) => state.swapIntoBundle);
  const toast = useToast();

  const offers = BUNDLES.flatMap((bundle) => {
    const components = bundle.bundleOf ?? [];
    if (!bundle.compareAtPrice || components.length === 0) return [];
    const present = components.filter((component) =>
      lines.some((line) => line.slug === component.slug && line.issue === null && line.quantity >= component.quantity),
    );
    if (present.length === 0) return [];
    const missing = components.filter((component) => !present.includes(component));
    // With the bundle already in the cart, "add the rest" would read as buying it twice.
    if (missing.length > 0 && lines.some((line) => line.slug === bundle.slug)) return [];
    const presentCost = present.reduce(
      (sum, component) => sum + (lines.find((line) => line.slug === component.slug)?.unitPrice.amount ?? 0) * component.quantity,
      0,
    );
    const missingCost = missing.reduce(
      (sum, component) => sum + (NAME_BY_SLUG.get(component.slug)?.price.amount ?? 0) * component.quantity,
      0,
    );
    return [{ bundle, components, present, missing, extra: bundle.price.amount - presentCost, missingCost }];
  });

  if (offers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {offers.map(({ bundle, components, missing, extra, missingCost }) => {
        const complete = missing.length === 0;
        const saving = (bundle.compareAtPrice?.amount ?? 0) - bundle.price.amount;
        const missingNames = missing.map((component) => shortName(NAME_BY_SLUG.get(component.slug)?.name ?? component.slug)).join(" e ");
        return (
          <div key={bundle.slug} data-testid="bundle-nudge" className="gd-hud relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
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
                Offerta duo
              </p>
              <p className="mt-1 text-small leading-snug text-graphite">
                {complete ? (
                  <>
                    Li hai già entrambi: passa al{" "}
                    <Link href={`/prodotto/${bundle.slug}`} className="font-bold underline-offset-2 hover:underline">
                      duo
                    </Link>{" "}
                    e risparmi <strong className="text-lime">{formatPrice({ amount: saving, currency: "EUR" })}</strong>.
                  </>
                ) : (
                  <>
                    Aggiungi {missingNames} con il duo:{" "}
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
              {complete ? "Passa al duo" : "Completa il duo"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
