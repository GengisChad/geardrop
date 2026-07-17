import Image from "next/image";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import type { ProductImage } from "@/data/assets";

type CatalogHeroProps = {
  title: string;
  /** Rendered as the lime line under the title, as in the category mockups. */
  tagline?: string;
  description: string;
  crumbs: readonly Crumb[];
  art?: ProductImage | { src: string; width: number; height: number };
};

/** Category banner from mockup-catalog-desktop / mockup-catalog-mobile. */
export function CatalogHero({ title, tagline, description, crumbs, art }: CatalogHeroProps) {
  return (
    <section
      data-testid="catalog-hero"
      className="gd-glass gd-section-ambient relative mx-4 mt-4 overflow-hidden rounded-[--radius-glass-lg] sm:mx-6"
    >
      <div className="gd-streaks absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="absolute -right-16 top-1/2 size-[30rem] -translate-y-1/2 rounded-full bg-violet/12 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1400px] items-center gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:py-12">
        <div>
          <Breadcrumbs items={crumbs} className="mb-4" />
          <h1 className="gd-display-wide text-[2rem] font-extrabold leading-[0.98] text-graphite sm:text-[2.75rem]">
            {title}
          </h1>
          {tagline ? (
            <p className="gd-display-wide mt-1 text-h3 font-extrabold leading-tight text-lime-ink sm:text-[1.5rem]">
              {tagline}
            </p>
          ) : null}
          <p className="mt-4 max-w-lg text-small text-grey-600 sm:text-body">{description}</p>
        </div>

        {art ? (
          <div className="relative hidden lg:block">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-2xl"
            />
            <Image
              src={art.src}
              alt=""
              aria-hidden="true"
              width={art.width}
              height={art.height}
              priority
              sizes="420px"
              className="relative mx-auto h-auto max-h-48 w-auto object-contain drop-shadow-[0_18px_28px_rgba(18,20,23,0.2)]"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
