import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Circle, Lock, ShieldCheck, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroImpact } from "@/components/home/hero-impact";
import { DEFAULT_HERO_TITLE, heroTitleLines } from "@/lib/home/hero-title";
import type { Product } from "@/lib/commerce/types";

const TRUST = [
  { Icon: ShieldCheck, title: "Prodotti originali", sub: "100% autentici" },
  { Icon: Zap, title: "Spedizione veloce", sub: "con tracking" },
  { Icon: Lock, title: "Pagamenti sicuri", sub: "protetti e affidabili" },
] as const;

const HUD = [
  { Icon: Circle, label: "Drop esclusivi" },
  { Icon: X, label: "Performance X" },
  { Icon: Circle, label: "Community GEAR//DROP" },
] as const;

/**
 * Light premium liquid-glass hero: a single floating pearl-glass card. The right side is
 * the energised GEAR//DROP emblem (no product), the left is the pitch. Everything is CSS
 * motion — no client JS — so it renders identically with scripts off or motion reduced.
 */
/**
 * Optional CMS overrides. Any field left undefined keeps the approved default, so a
 * managed hero can restyle the copy and the primary CTA without touching the design,
 * the glass card or the impact artwork.
 */
export type HeroContent = {
  readonly eyebrow?: string | null;
  readonly title?: string | null;
  readonly subtitle?: string | null;
  readonly description?: string | null;
  readonly ctaLabel?: string | null;
  readonly ctaHref?: string | null;
};

export function Hero({ product, content }: { product: Product; content?: HeroContent }) {
  const primaryHref = (content?.ctaHref?.trim() || `/prodotto/${product.slug}`) as Route;
  const primaryLabel = content?.ctaLabel?.trim() || "Acquista ora";
  const description =
    content?.description?.trim() ||
    content?.subtitle?.trim() ||
    "Prodotti originali, drop esclusivi e una community di appassionati. Massima performance, ogni battaglia.";
  const titleLines = heroTitleLines(content?.title?.trim() || DEFAULT_HERO_TITLE);

  return (
    <section className="gd-hero-field relative px-3 pb-6 pt-4 sm:px-6">
      <div className="relative mx-auto max-w-[1400px]">
        <div
          data-testid="hero-glass"
          className="gd-glass relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 lg:px-12 lg:py-16"
        >
          {/* Ambient layers inside the card */}
          <div className="gd-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
          <div className="gd-streaks pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-24 size-[36rem] rounded-full bg-violet/10 blur-3xl"
          />

          <div className="relative grid items-center gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-0">
            {/* Left — the pitch */}
            <div>
              <p className="gd-display-wide gd-glass-compact inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-small font-bold tracking-[0.2em] text-graphite">
                {content?.eyebrow?.trim() ? (
                  content.eyebrow
                ) : (
                  <>
                    Beyblade <span className="text-lime-ink">X</span>
                  </>
                )}
              </p>

              <h1 className="gd-display-wide mt-6 text-[2.75rem] font-extrabold leading-[0.9] sm:text-[3.5rem] lg:text-[4.25rem]">
                {titleLines.map((line, index) => (
                  <span
                    key={line}
                    className={`block ${index === titleLines.length - 1 ? "text-lime-ink" : "text-graphite"}`}
                  >
                    {line}
                  </span>
                ))}
              </h1>

              <p className="mt-6 max-w-md text-body text-grey-600">{description}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button as={Link} href={primaryHref} variant="primary" size="lg" className="sm:w-auto">
                  {primaryLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
                <Button as={Link} href="/negozio" variant="glass" size="lg" className="sm:w-auto">
                  Esplora il catalogo
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>

              {/* Trust strip */}
              <ul className="gd-glass-panel mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl px-5 py-3.5">
                {TRUST.map(({ Icon, title, sub }, i) => (
                  <li key={title} className="flex items-center gap-2.5">
                    {i > 0 ? <span aria-hidden="true" className="mr-3 hidden h-8 w-px bg-grey-300/70 sm:block" /> : null}
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-tint ring-1 ring-white/60">
                      <Icon className="size-4 text-violet" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="gd-display block text-[0.625rem] font-bold tracking-wider text-graphite">{title}</span>
                      <span className="block text-[0.625rem] leading-tight text-grey-600">{sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — the energy impact */}
            <HeroImpact />
          </div>

          {/* Bottom HUD status strip */}
          <div className="relative mt-10 hidden items-center gap-4 border-t border-white/50 pt-5 md:flex">
            {HUD.map(({ Icon, label }, i) => (
              <div key={label} className="flex items-center gap-4">
                {i > 0 ? <span aria-hidden="true" className="h-px w-8 bg-grey-300/70 lg:w-16" /> : null}
                <span className="gd-display flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.18em] text-grey-600">
                  <Icon className="size-3 text-violet" strokeWidth={2.5} aria-hidden="true" />
                  {label}
                </span>
              </div>
            ))}
            <span aria-hidden="true" className="ml-auto h-px flex-1 bg-grey-300/50" />
          </div>
        </div>
      </div>
    </section>
  );
}
