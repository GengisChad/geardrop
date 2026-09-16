import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Arena } from "@/components/home/arena";
import { Arsenal } from "@/components/home/arsenal";
import { Hero } from "@/components/home/hero";
import { TrustBandDark } from "@/components/home/trust";
import { Reveal } from "@/components/ui/reveal";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { HOME_FEATURED_LIMIT, newReleases } from "@/lib/home/product-selection";
import { jsonLd, siteJsonLd } from "@/lib/seo";
import { resolveHomepageSections } from "@/lib/storefront/homepage-resolver";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** The hero deals at most three cards. */
const HERO_CARDS = 3;

export default async function HomePage() {
  const commerce = await getCommerceProvider();

  const [featured, latest, bestSellers, bundle, bundleHero, all, managed] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: HOME_FEATURED_LIMIT }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct("drop-attack-battle-set"),
    commerce.listProducts({ perPage: 100 }),
    storefrontContent.getHomepage(),
  ]);

  // Without a catalogue the page has nothing to deal.
  if (all.items.length === 0) notFound();

  // The owner's new releases lead; without any, the hero deals the leading featured products.
  const releases = newReleases(all.items);
  const heroProducts = (releases.length > 0 ? releases : featured.items).slice(0, HERO_CARDS);

  const fallback: ManagedHomepageFallback = {
    heroProducts,
    heroIsNewRelease: releases.length > 0,
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

  // New releases open the arsenal, then the rest of the catalogue in its own order.
  const arsenal = [...releases, ...all.items.filter((product) => !releases.includes(product))];

  return (
    <>
      {structuredData}
      {/* The hero holds the LCP image, so it is never revealed on scroll: it paints at once. */}
      <Hero products={heroProducts} isNewRelease={releases.length > 0} />
      <Arena products={heroProducts} />
      <Arsenal products={arsenal} />
      <Reveal>
        <TrustBandDark className="pb-20" />
      </Reveal>
    </>
  );
}
