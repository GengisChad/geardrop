import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_HERO_TITLE, NEW_RELEASES_HERO_TITLE, heroTitleLines } from "@/lib/home/hero-title";
import { displayName } from "@/lib/holo";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/**
 * Optional CMS overrides. Any field left undefined keeps the approved default, so a
 * managed hero can restyle the copy and the secondary CTA without touching the cards.
 */
export type HeroContent = {
  readonly eyebrow?: string | null;
  readonly title?: string | null;
  readonly subtitle?: string | null;
  readonly description?: string | null;
  readonly ctaLabel?: string | null;
  readonly ctaHref?: string | null;
};

/** The whole current drop at a glance: up to four cards, side by side from lg. */
export const HERO_CARDS = 4;

function listNames(products: readonly Product[]): string {
  const names = products.map((product) => displayName(product.name));
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * The pitch, then the new releases as product cards right under it, so every piece of the
 * current drop is on the first screen with its price, availability and cart button. The owner
 * asked for a clean page on 2026-09-21: no card fan, no fight animation, the drop up front.
 */
export function Hero({
  products,
  content,
  isNewRelease = true,
}: {
  readonly products: readonly Product[];
  readonly content?: HeroContent;
  readonly isNewRelease?: boolean;
}) {
  const shown = products.slice(0, HERO_CARDS);
  if (shown.length === 0) return null;

  const counted = shown.every((product) => product.availableQuantity !== undefined);
  const lines = heroTitleLines(content?.title?.trim() || (isNewRelease ? NEW_RELEASES_HERO_TITLE : DEFAULT_HERO_TITLE));
  // Pre-order wording only while every dealt card really is a pre-order.
  const opening = shown.every((product) => product.stock === "pre-ordine") ? "Pre-ordini aperti" : "Disponibili ora";
  const eyebrow = content?.eyebrow?.trim() || `${opening} · ${isNewRelease ? "Nuove uscite" : "Beyblade X"}`;
  const description =
    content?.description?.trim() ||
    content?.subtitle?.trim() ||
    `${listNames(shown)}. ${counted ? "Pezzi contati: prendi il tuo prima che finiscano." : "Disponibilità indicata su ogni carta."}`;
  const cmsHref = content?.ctaHref?.trim();
  const cmsLabel = content?.ctaLabel?.trim();
  const secondaryHref = (cmsHref && cmsLabel ? cmsHref : "/negozio") as Route;
  const secondaryLabel = cmsHref && cmsLabel ? cmsLabel : "Tutto il negozio";

  return (
    <section data-testid="hero" className="relative isolate">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-7 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="min-w-0">
            <p className="gd-mono inline-flex min-h-[2.125rem] items-center gap-2.5 border border-lime/35 bg-lime/[0.06] px-3.5 py-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-lime sm:text-[0.75rem]">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-lime" />
              {eyebrow}
            </p>
            <h1 className="gd-display-wide mt-5 text-[2.35rem] font-bold leading-[0.92] sm:text-[3.25rem] xl:text-[4rem]">
              {lines.map((line, index) => (
                <Fragment key={`${index}-${line}`}>
                  {/* The space between spans is real text, so the heading still reads as a sentence. */}
                  {index > 0 ? " " : null}
                  <span className={cn("block", index === lines.length - 1 && "gd-holo-text")}>{line}</span>
                </Fragment>
              ))}
            </h1>
          </div>

          <div className="lg:max-w-[27rem] lg:pb-1">
            {/* Phones skip the list of names: the cards right below carry them, and come up a screen sooner. */}
            <p className="hidden text-[1rem] leading-relaxed text-grey-600 sm:block sm:text-[1.0625rem]">{description}</p>
            <Button as={Link} href={secondaryHref} variant="glass" size="lg" className="w-full sm:mt-5 sm:w-auto">
              {secondaryLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <h2 className="sr-only">{isNewRelease ? "Nuove uscite" : "In evidenza"}</h2>
        <ul data-testid="hero-products" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:gap-5">
          {shown.map((product, index) => (
            <li key={product.slug}>
              <ProductCard product={product} showTagline priority={index < 2} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
