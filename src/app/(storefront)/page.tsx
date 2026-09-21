import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Arsenal } from "@/components/home/arsenal";
import { HERO_CARDS, Hero } from "@/components/home/hero";
import { ProductShelf } from "@/components/home/product-shelf";
import { TrustBandDark } from "@/components/home/trust";
import { Reveal } from "@/components/ui/reveal";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { STANDARD_DELIVERY } from "@/lib/labels";
import { HOME_FEATURED_LIMIT, homepagePlan } from "@/lib/home/product-selection";
import { jsonLd, siteJsonLd } from "@/lib/seo";
import { resolveHomepageSections } from "@/lib/storefront/homepage-resolver";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** The bundle the managed homepage can spotlight. */
const DUO_SLUG = "duo-horus-enlil";

export default async function HomePage() {
  const commerce = await getCommerceProvider();

  const [featured, latest, bestSellers, bundle, bundleHero, all, managed] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: HOME_FEATURED_LIMIT }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct(DUO_SLUG),
    commerce.listProducts({ perPage: 100 }),
    storefrontContent.getHomepage(),
  ]);

  // Without a catalogue the page has nothing to deal.
  if (all.items.length === 0) notFound();

  // The new releases still on sale lead, then what ships right away, then the rest.
  const plan = homepagePlan(all.items, HERO_CARDS);

  const fallback: ManagedHomepageFallback = {
    heroProducts: plan.hero,
    heroIsNewRelease: plan.heroIsNewRelease,
    bundleHero,
    bundle,
    featured: featured.items,
    latest: latest.items,
    bestSellers: bestSellers.items,
    all: all.items,
  };

  // Tells Google who sells here and how to search the shop (sitelinks search box).
  const structuredData = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(siteJsonLd()) }} />;

  // Managed path: the CMS controls order, copy, visibility and product targets; the same
  // Holo Drop components render them. When no managed content is published, the approved
  // composition below stands in.
  if (managed && managed.length > 0) {
    const sections = await resolveHomepageSections(managed, commerce);
    return (
      <>
        {structuredData}
        <ManagedHomepage sections={sections} fallback={fallback} />
      </>
    );
  }

  // The owner's order (2026-09-21): the drop on the first screen, what ships now right under
  // it, then everything else. Clean on purpose: no fight animation, no banner in between.
  return (
    <>
      {structuredData}
      {/* The hero holds the LCP image, so it is never revealed on scroll: it paints at once. */}
      <Hero products={plan.hero} isNewRelease={plan.heroIsNewRelease} />
      <ProductShelf testId="ready-to-ship" kicker="Disponibili subito" title="Pronti da spedire" note={STANDARD_DELIVERY} products={plan.ready} />
      <Arsenal products={plan.rest} title="Tutto il resto" kicker="Catalogo" />
      <Reveal>
        <TrustBandDark className="pb-20" />
      </Reveal>
    </>
  );
}
