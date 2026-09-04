import type { Route } from "next";
import Link from "next/link";
import { Hero, type HeroContent } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/category-tiles";
import { StatusLegend } from "@/components/home/status-legend";
import { TrustBandDark, TrustBarLight } from "@/components/home/trust";
import { BundleBanner } from "@/components/home/bundle-banner";
import { ClubBand } from "@/components/home/club-band";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Reveal } from "@/components/ui/reveal";
import type { Bundle, Product } from "@/lib/commerce/types";
import type { HomepageSection } from "@/lib/content/types";
import { allocateUniqueProductSections } from "@/lib/home/product-selection";
import type { ResolvedHomepageSection } from "@/lib/storefront/homepage-resolver";

/**
 * The managed homepage: the same liquid glass components the storefront has always used,
 * now ordered, captioned and targeted by the CMS instead of hardcoded. It replaces the
 * placeholder renderer that painted CMS rows onto a graphite scaffold.
 *
 * The division of labour is deliberate: the CMS controls data, copy, order and
 * visibility; these components control presentation. There is exactly one homepage UI —
 * this is not a second design that happens to read the database.
 */

export type ManagedHomepageFallback = {
  readonly heroProduct: Product;
  readonly bundle: Bundle | null;
  readonly featured: readonly Product[];
  readonly latest: readonly Product[];
  readonly bestSellers: readonly Product[];
  readonly all: readonly Product[];
};

function heroContentOf(section: HomepageSection): HeroContent {
  return {
    eyebrow: section.eyebrow,
    title: section.title,
    subtitle: section.subtitle,
    description: section.description,
    ctaLabel: section.cta_label,
    ctaHref: section.cta_href,
  };
}

/** CMS-selected products for a section, or that section's default catalogue query. */
function productsFor(
  resolved: readonly Product[],
  fallback: readonly Product[],
): readonly Product[] {
  return resolved.length > 0 ? resolved : fallback;
}

/** Resolve a product section before the page-wide first-occurrence allocation runs. */
function productCandidatesFor(
  resolved: ResolvedHomepageSection,
  fallback: ManagedHomepageFallback,
): readonly Product[] | undefined {
  const { section, products } = resolved;

  switch (section.section_type) {
    case "featured_products":
    case "offers":
      return productsFor(products, fallback.featured);
    case "latest_drops":
    case "new_arrivals":
      return productsFor(products, fallback.latest);
    case "bestsellers":
      return productsFor(products, fallback.bestSellers);
    case "competitive_products":
      return productsFor(products, fallback.all);
    default:
      return undefined;
  }
}

/**
 * Light-glass frame for the secondary section types the enum allows but that have no
 * bespoke component yet (announcement, newsletter, promo_banner, rich_text, cta). It is
 * pearl-glass and readable, never the old graphite block, and never prints ids or
 * relation counts. A section with nothing to say renders nothing.
 */
function GenericSection({ section }: { readonly section: HomepageSection }) {
  const hasContent = Boolean(section.eyebrow || section.title || section.subtitle || section.description);
  if (!hasContent) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6" data-section-type={section.section_type}>
      <div className="gd-glass-panel rounded-[--radius-glass] px-6 py-8 sm:px-10">
        {section.eyebrow ? (
          <p className="gd-display text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-violet">
            {section.eyebrow}
          </p>
        ) : null}
        {section.title ? (
          <h2 className="gd-display-wide mt-2 text-2xl font-extrabold text-graphite sm:text-3xl">{section.title}</h2>
        ) : null}
        {section.subtitle ? <p className="mt-3 max-w-2xl text-body text-grey-600">{section.subtitle}</p> : null}
        {section.description ? (
          <p className="mt-2 max-w-2xl whitespace-pre-line text-small text-grey-600">{section.description}</p>
        ) : null}
        {section.cta_label && section.cta_href ? (
          <Link
            href={section.cta_href as Route}
            className="gd-display gd-glass-compact gd-glass-interactive mt-6 inline-flex h-11 items-center rounded-2xl px-5 text-small font-bold tracking-wider text-graphite"
          >
            {section.cta_label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function renderSection(
  resolved: ResolvedHomepageSection,
  fallback: ManagedHomepageFallback,
  displayProducts: readonly Product[] | undefined,
): React.ReactNode {
  const { section } = resolved;

  switch (section.section_type) {
    case "hero":
      // Above the fold and the LCP element: never wrapped in Reveal, must paint at once.
      return <Hero key={section.id} product={fallback.heroProduct} content={heroContentOf(section)} />;

    case "categories":
      return (
        <Reveal key={section.id}>
          <CategoryTiles categorySlugs={resolved.categorySlugs} />
        </Reveal>
      );

    case "status_legend":
      return (
        <Reveal key={section.id}>
          <StatusLegend />
        </Reveal>
      );

    case "trust":
      // Deterministic by section_key, never by position: the approved composition puts
      // TrustBandDark under the `trust` key. A light variant is opt-in via an explicit
      // key (`trust-light`/`…-bar`), so moving the section never changes its design.
      return (
        <Reveal key={section.id}>
          {/(light|bar)/i.test(section.section_key) ? (
            <TrustBarLight className="pb-12" />
          ) : (
            <TrustBandDark className="pb-12" />
          )}
        </Reveal>
      );

    case "featured_products":
      return (
        <Reveal key={section.id}>
          <ProductCarousel
            title={section.title || "In evidenza"}
            products={displayProducts ?? []}
            href="/negozio"
            dots
            className="pb-12"
          />
        </Reveal>
      );

    case "latest_drops":
    case "new_arrivals":
      return (
        <Reveal key={section.id}>
          <ProductCarousel
            title={section.title || "Ultimi drop"}
            products={displayProducts ?? []}
            href="/negozio?sort=novita"
            className="pb-12"
          />
        </Reveal>
      );

    case "bestsellers":
      return (
        <Reveal key={section.id}>
          <ProductCarousel
            title={section.title || "Pre-ordini aperti"}
            products={displayProducts ?? []}
            href="/negozio/beyblade-x"
            className="pb-4"
          />
        </Reveal>
      );

    case "offers":
      return (
        <Reveal key={section.id}>
          <ProductCarousel
            title={section.title || "Offerte"}
            products={displayProducts ?? []}
            href="/negozio"
            className="pb-12"
          />
        </Reveal>
      );

    case "bundle": {
      // The CMS-selected bundle with its own hero product; the default bundle only when
      // the section names none. A section that names an unpublishable bundle renders
      // nothing rather than quietly showing a different one.
      const chosen = resolved.bundle
        ? resolved.bundle
        : section.bundleIds.length === 0 && fallback.bundle
          ? { bundle: fallback.bundle, hero: fallback.heroProduct }
          : null;
      return chosen ? (
        <Reveal key={section.id}>
          <BundleBanner bundle={chosen.bundle} hero={chosen.hero} />
        </Reveal>
      ) : null;
    }

    case "competitive_products":
      return (
        <Reveal key={section.id}>
          <ProductCarousel
            title={section.title || "Esplora il catalogo"}
            products={displayProducts ?? []}
            href="/negozio/beyblade-x"
            className="pb-12"
          />
        </Reveal>
      );

    case "club":
      return (
        <Reveal key={section.id}>
          <ClubBand />
        </Reveal>
      );

    case "announcement":
    case "newsletter":
    case "promo_banner":
    case "rich_text":
    case "cta":
      return <GenericSection key={section.id} section={section} />;

    default:
      return null;
  }
}

export function ManagedHomepage({
  sections,
  fallback,
}: {
  readonly sections: readonly ResolvedHomepageSection[];
  readonly fallback: ManagedHomepageFallback;
}) {
  const allocatedProducts = allocateUniqueProductSections(
    sections.map((resolved) => productCandidatesFor(resolved, fallback)),
  );

  return <>{sections.map((resolved, index) => renderSection(resolved, fallback, allocatedProducts[index]))}</>;
}
