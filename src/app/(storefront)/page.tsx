import { notFound } from "next/navigation";
import { Hero } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/category-tiles";
import { StatusLegend } from "@/components/home/status-legend";
import { TrustBandDark, TrustBarLight } from "@/components/home/trust";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Reveal } from "@/components/ui/reveal";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { resolveHomepageSections } from "@/lib/storefront/homepage-resolver";

export default async function HomePage() {
  const commerce = await getCommerceProvider();

  const [featured, latest, bestSellers, bundle, hero, all, managed] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: 6 }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct("drop-attack-battle-set"),
    commerce.listProducts({ perPage: 100 }),
    storefrontContent.getHomepage(),
  ]);

  // The hero product is the catalogue's anchor SKU; without it the page is meaningless.
  if (!hero) notFound();

  const fallback: ManagedHomepageFallback = {
    heroProduct: hero,
    bundle,
    featured: featured.items,
    latest: latest.items,
    bestSellers: bestSellers.items,
    all: all.items,
  };

  // Managed path: the CMS controls order, copy, visibility and product targets; the same
  // liquid glass components render them. This is what production serves. It replaced the
  // placeholder renderer whose "N target relazionali" graphite scaffold was the black
  // page. When no managed content is published, the hardcoded composition below stands
  // in — never the scaffold.
  if (managed && managed.length > 0) {
    const sections = await resolveHomepageSections(managed, commerce);
    return <ManagedHomepage sections={sections} fallback={fallback} />;
  }

  return (
    <>
      {/* The hero is the LCP element and sits above the fold, so it is never revealed on
          scroll: it must paint at once. Reveal starts below it. */}
      <Hero product={hero} />
      <CategoryTiles />
      <StatusLegend />

      <Reveal>
        <ProductCarousel title="In evidenza" products={featured.items} href="/negozio" dots className="pb-12" />
      </Reveal>

      <Reveal>
        <TrustBandDark className="pb-12" />
      </Reveal>

      <Reveal>
        <ProductCarousel title="Ultimi drop" products={latest.items} href="/negozio?sort=novita" className="pb-12" />
      </Reveal>

      <Reveal>
        <ProductCarousel
          title="Pre-ordini aperti"
          products={bestSellers.items}
          href="/negozio/beyblade-x"
          className="pb-4"
        />
      </Reveal>

      <Reveal>
        <TrustBarLight className="pb-12" />
      </Reveal>

      <Reveal>
        <ProductCarousel
          title="Esplora il catalogo"
          products={all.items}
          href="/negozio/beyblade-x"
          className="pb-12"
        />
      </Reveal>
    </>
  );
}
