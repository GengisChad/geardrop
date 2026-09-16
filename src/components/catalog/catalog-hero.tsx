import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";

type CatalogHeroProps = {
  title: string;
  /** Rendered as the lime line under the title, as in the category mockups. */
  tagline?: string;
  description: string;
  crumbs: readonly Crumb[];
};

/** Category banner: title and copy only; the right side stays clean by owner request (2026-09-16). */
export function CatalogHero({ title, tagline, description, crumbs }: CatalogHeroProps) {
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

      <div className="relative mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:py-12">
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

      </div>
    </section>
  );
}
