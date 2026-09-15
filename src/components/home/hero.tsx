"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, ShoppingCart } from "lucide-react";
import { HoloCard } from "@/components/holo/holo-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { brand, brandSize } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { DEFAULT_HERO_TITLE, NEW_RELEASES_HERO_TITLE, heroTitleLines } from "@/lib/home/hero-title";
import { displayName, holoPalette, shortName } from "@/lib/holo";
import { STOCK_CTA, isPurchasable } from "@/lib/labels";
import { useCart } from "@/lib/store/cart";
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

type SlotPosition = "center" | "left" | "right";

const HERO_CARDS = 3;

/** Centre card is the featured one; with three cards the next goes right, the other left. */
function slotPosition(index: number, featured: number, count: number): SlotPosition {
  if (index === featured) return "center";
  if (count < 3) return "right";
  return (index - featured + count) % count === 1 ? "right" : "left";
}

function listNames(products: readonly Product[]): string {
  const names = products.map((product) => displayName(product.name));
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * Holo Drop hero: the pitch on the left, the new releases dealt as holographic cards on the
 * right. From lg the cards fan out and the visitor picks the front one; below lg they are a
 * swipeable rail. The primary CTA pre-orders whichever card is in front.
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
  const [featured, setFeatured] = useState(0);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const [justAdded, setJustAdded] = useState(false);
  const add = useCart((s) => s.add);
  const toast = useToast();
  const frame = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  const current = shown[featured] ?? shown[0];
  if (!current) return null;

  const counted = shown.every((product) => product.availableQuantity !== undefined);
  const lines = heroTitleLines(content?.title?.trim() || (isNewRelease ? NEW_RELEASES_HERO_TITLE : DEFAULT_HERO_TITLE));
  const eyebrow =
    content?.eyebrow?.trim() || (isNewRelease ? "Pre-ordini aperti · Nuove uscite" : "Pre-ordini aperti · Beyblade X");
  const description =
    content?.description?.trim() ||
    content?.subtitle?.trim() ||
    `${listNames(shown)}. ${counted ? "Pezzi contati: prenota il tuo prima che finiscano." : "Disponibilità indicata su ogni carta."}`;
  const cmsHref = content?.ctaHref?.trim();
  const cmsLabel = content?.ctaLabel?.trim();
  const secondaryHref = (cmsHref && cmsLabel ? cmsHref : "/negozio") as Route;
  const secondaryLabel = cmsHref && cmsLabel ? cmsLabel : "Tutto il negozio";

  const spotlight = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const element = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = element.getBoundingClientRect();
      element.style.setProperty("--sx", `${(((clientX - box.left) / box.width) * 100).toFixed(1)}%`);
      element.style.setProperty("--sy", `${(((clientY - box.top) / box.height) * 100).toFixed(1)}%`);
    });
  };

  const magnet = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    element.style.transition = "transform 0.25s var(--ease-out-gear), background-color 0.2s";
    element.style.transform = `translate(${(x * box.width * 0.12).toFixed(1)}px, ${(y * box.height * 0.3).toFixed(1)}px)`;
  };

  const release = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.transform = "";
  };

  const addCurrent = () => {
    add(current.slug, 1);
    setJustAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustAdded(false), 1600);
    toast.push({ tone: "success", message: `${current.name} aggiunto al carrello.` });
  };

  const toggleFlip = (slug: string) =>
    setFlipped((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <section data-testid="hero" className="relative isolate overflow-hidden [--sx:72%] [--sy:42%]" onPointerMove={spotlight}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(560px_circle_at_var(--sx)_var(--sy),rgba(198,255,0,0.08),transparent_70%)]"
      />
      <div aria-hidden="true" className="gd-floor -z-10" />

      <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] items-center gap-4 px-4 pb-6 pt-8 sm:px-6 lg:min-h-[46rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-6 lg:px-10 lg:pb-10 lg:pt-4 xl:min-h-[52rem] xl:pl-16">
        <div className="relative z-10">
          <p className="gd-mono inline-flex min-h-[2.125rem] items-center gap-2.5 border border-lime/35 bg-lime/[0.06] px-3.5 py-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-lime sm:text-[0.75rem]">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-lime shadow-[0_0_0_0_rgba(198,255,0,0.6)] animate-[gd-pulse-ring_1.6s_ease-out_infinite]"
            />
            {eyebrow}
          </p>

          <h1 className="gd-display-wide mt-6 text-[2.9rem] font-bold leading-[0.9] sm:text-[4rem] lg:text-[3.9rem] xl:text-[5.25rem]">
            {lines.map((line, index) => (
              <Fragment key={`${index}-${line}`}>
                {/* The space between spans is real text, so the heading still reads as a sentence. */}
                {index > 0 ? " " : null}
                <span className={cn("block", index === lines.length - 1 && "gd-holo-text")}>{line}</span>
              </Fragment>
            ))}
          </h1>

          <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-relaxed text-grey-600 sm:text-[1.1875rem]">{description}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {isPurchasable(current.stock) ? (
              <div className="gd-glow">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={addCurrent}
                  onPointerMove={magnet}
                  onPointerLeave={release}
                  data-testid="hero-add-to-cart"
                >
                  {justAdded ? (
                    <Check className="size-5" aria-hidden="true" />
                  ) : (
                    <ShoppingCart className="size-5" aria-hidden="true" />
                  )}
                  <span>{justAdded ? "Aggiunto al carrello" : `${STOCK_CTA[current.stock]} ${shortName(current.name)}`}</span>
                  {justAdded ? null : (
                    <span className="tabular border-l border-void/25 pl-3">{formatPrice(current.price)}</span>
                  )}
                </Button>
              </div>
            ) : null}
            <Button as={Link} href={secondaryHref} variant="glass" size="lg" className="sm:w-auto">
              {secondaryLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {shown.length > 1 && counted ? (
            <div className="mt-10 hidden sm:block">
              <p className="gd-mono mb-3 text-[0.6875rem] uppercase tracking-[0.16em] text-grey-400">Pezzi disponibili</p>
              <div className="flex flex-wrap gap-2.5">
                {shown.map((product, index) => (
                  <button
                    key={product.slug}
                    type="button"
                    onClick={() => setFeatured(index)}
                    aria-pressed={index === featured}
                    style={{ "--c": holoPalette(product).f2 } as CSSProperties}
                    className={cn(
                      "flex h-14 items-center gap-3 border border-white/10 bg-white/[0.025] pl-3 pr-4 text-small font-semibold transition-[border-color,box-shadow] duration-200 hover:border-white/25",
                      index === featured && "border-[var(--c)] shadow-[inset_0_0_0_1px_var(--c),0_0_26px_-10px_var(--c)]",
                    )}
                  >
                    <span className="gd-mono tabular text-[1.375rem] font-bold text-[var(--c)]">
                      {String(product.availableQuantity ?? 0).padStart(2, "0")}
                    </span>
                    <span>{shortName(product.name)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative lg:h-[42rem] xl:h-[47.5rem]">
          <h2 className="sr-only">{isNewRelease ? "Nuove uscite" : "In evidenza"}</h2>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center lg:flex">
            <Image
              src={brand.emblem}
              alt=""
              width={brandSize.emblem.width}
              height={brandSize.emblem.height}
              sizes="700px"
              className="w-[36rem] max-w-none opacity-10 animate-[gd-spin_50s_linear_infinite] xl:w-[43.75rem]"
            />
            <span className="absolute size-[35rem] rounded-full bg-[radial-gradient(closest-side,rgba(122,60,255,0.5),rgba(122,60,255,0.12)_60%,transparent)] animate-[gd-breathe_5s_ease-in-out_infinite]" />
          </div>

          <ul className="gd-scrollbar-none relative -mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-4 pt-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:h-full lg:overflow-visible lg:p-0 lg:[perspective:1800px]">
            {shown.map((product, index) => {
              const position = slotPosition(index, featured, shown.length);
              return (
                <li key={product.slug} data-pos={position} className="gd-fan-slot" onClick={() => setFeatured(index)}>
                  <HoloCard
                    product={product}
                    position={index + 1}
                    total={shown.length}
                    flipped={flipped.has(product.slug)}
                    onFlip={() => toggleFlip(product.slug)}
                    auto={position === "center"}
                    priority={index === 0}
                  />
                </li>
              );
            })}
          </ul>

          <p className="gd-mono text-center text-[0.6875rem] uppercase tracking-[0.14em] text-grey-400 lg:absolute lg:inset-x-0 lg:bottom-2">
            <span className="lg:hidden">Scorri le carte · tocca la freccia per girarle</span>
            <span className="hidden lg:inline">Passa il mouse sulle carte · clicca per portarle davanti</span>
          </p>
        </div>
      </div>
    </section>
  );
}
