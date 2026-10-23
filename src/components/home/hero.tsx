import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight, Lock, RotateCcw, Truck } from "lucide-react";
import { fillerSpan, ShopTile } from "@/components/home/shop-tile";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_HERO_TITLE, NEW_RELEASES_HERO_TITLE, heroTitleLines } from "@/lib/home/hero-title";
import { displayName } from "@/lib/holo";
import { FREE_SHIPPING_FROM_LABEL, SHIPPING_FLAT_LABEL } from "@/lib/labels";
import type { Product } from "@/lib/commerce/types";

/** The promises checkout keeps, as a short list beside the pitch. */
const HERO_FACTS = [
  { Icon: Truck, strong: `Spedizione da ${SHIPPING_FLAT_LABEL}`, rest: ` · gratis da ${FREE_SHIPPING_FROM_LABEL}` },
  { Icon: Lock, strong: "Carta, PayPal, Apple Pay", rest: " o Google Pay" },
  { Icon: RotateCcw, strong: "Reso gratuito", rest: " entro 30 giorni" },
] as const;

/** The closing line of the headline: its first word on the lime slab, the rest after it. */
function SlabLine({ line }: { readonly line: string }) {
  const [first = "", ...rest] = line.split(" ");
  return (
    <>
      <span className="gd-slab">{first}</span>
      {rest.length ? ` ${rest.join(" ")}` : null}
    </>
  );
}

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

/** The whole current drop at a glance: up to five cards, side by side from lg. */
export const HERO_CARDS = 5;

function listNames(products: readonly Product[]): string {
  const names = products.map((product) => displayName(product.name));
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * The pitch, then the new releases as product cards right under it, so every piece of the
 * current drop is on the first screen with its price, availability and cart button. The owner
 * asked for a clean page on 2026-09-21: no card fan, no fight animation, the drop up front.
 * X-Rail (2026-10-23): one sticker names what the cards are, the closing word sits on a lime
 * slab, and faint stadium rings stand behind the pitch.
 */
export function Hero({
  products,
  content,
  isNewRelease = true,
  heading,
}: {
  readonly products: readonly Product[];
  readonly content?: HeroContent;
  readonly isNewRelease?: boolean;
  /** What the dealt cards are, for screen readers; defaults from `isNewRelease`. */
  readonly heading?: string;
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
    <section data-testid="hero" className="relative isolate overflow-hidden">
      {/* Stadium rings behind the pitch, one lime and one violet arc on the inner ring. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-60 -top-40 -z-10 hidden size-[54rem] rounded-full bg-[repeating-radial-gradient(circle,transparent_0_42px,rgba(255,255,255,0.05)_42px_43px)] [mask-image:radial-gradient(closest-side,#000_25%,transparent)] lg:block"
      >
        <span className="absolute inset-[21%] rotate-[20deg] rounded-full border-2 border-transparent border-r-violet/50 border-t-lime/45" />
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-7 sm:px-6 lg:px-10 lg:pb-16 lg:pt-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="min-w-0">
            <p className="gd-sticker bg-lime px-2.5 py-1 text-[0.6875rem] text-void sm:text-[0.75rem]">{eyebrow}</p>
            <h1 className="gd-display-wide mt-6 text-[2.5rem] font-extrabold leading-[0.92] [font-stretch:125%] sm:text-[3.6rem] sm:[font-stretch:132%] xl:text-[5rem]">
              {lines.map((line, index) => (
                <Fragment key={`${index}-${line}`}>
                  {/* The space between spans is real text, so the heading still reads as a sentence. */}
                  {index > 0 ? " " : null}
                  <span className="block">{index === lines.length - 1 ? <SlabLine line={line} /> : line}</span>
                </Fragment>
              ))}
            </h1>
          </div>

          <div className="lg:max-w-[25rem] lg:pb-2">
            {/* Phones skip the list of names: the cards right below carry them, and come up a screen sooner. */}
            <p className="hidden text-[1.0625rem] leading-relaxed text-grey-700 sm:block sm:text-[1.1875rem]">{description}</p>
            <Button as={Link} href={secondaryHref} variant="primary" size="lg" className="w-full sm:mt-6 sm:w-auto">
              {secondaryLabel}
              <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
            </Button>
            <ul className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 sm:mt-7 sm:flex-col sm:justify-start sm:gap-3">
              {HERO_FACTS.map(({ Icon, strong, rest }) => (
                <li key={strong} className="flex items-center gap-2 text-[0.75rem] text-grey-600 sm:gap-3 sm:text-[0.9375rem] sm:text-grey-700">
                  <Icon className="hidden size-5 shrink-0 text-lime sm:block" strokeWidth={2} aria-hidden="true" />
                  <span>
                    <b className="font-semibold text-graphite">{strong}</b>
                    <span className="hidden sm:inline">{rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h2 className="sr-only">{heading ?? (isNewRelease ? "Nuove uscite" : "In evidenza")}</h2>
        <ul data-testid="hero-products" className="mt-8 grid grid-cols-2 gap-2.5 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {shown.map((product, index) => (
            <li key={product.slug}>
              <ProductCard product={product} showTagline priority={index < 2} />
            </li>
          ))}
          {/* A short row ends in the shop tile, not in a dead gap. */}
          <li className={fillerSpan(shown.length, { base: 2, sm: 3, lg: 5 })} data-testid="hero-shop-tile">
            <ShopTile href="/negozio" kicker={`Spedizione gratis da ${FREE_SHIPPING_FROM_LABEL}`} title="Vedi tutto il negozio" />
          </li>
        </ul>
      </div>
    </section>
  );
}
